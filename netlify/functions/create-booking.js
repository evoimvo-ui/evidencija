const admin = require('firebase-admin');
const crypto = require('crypto');
const {
  buildServiceDurationLookups,
  getWorkingDayDetails,
  isTimeSlotAvailable
} = require('./booking-availability');

const ENCRYPTION_KEY = 'pustopoljina-evidencija-v2';
const SALT = 'evidencija-fixed-salt-2026';

async function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, Buffer.from(SALT), 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return combined.toString('base64');
}

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('[Firebase Admin] Greška pri inicijalizaciji:', error.message);
  }
}

const db = admin.firestore();

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const body = JSON.parse(event.body);
    const { slug, date, time, serviceId, clientName, clientPhone, clientEmail, note, website } = body;

    // Honeypot check - if website is filled, silently return success
    if (website) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
      };
    }

    // Validate required fields
    if (!slug || !date || !time || !serviceId || !clientName || !clientPhone) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Find user by bookingSlug
    const bookingSlugDoc = await db.collection('bookingSlugs').doc(slug).get();
    if (!bookingSlugDoc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    
    const userId = bookingSlugDoc.data().userId;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    
    const userData = userDoc.data();
    const shopId = userData.shopId;

    // Get service data
    const serviceDoc = await db.collection('services').doc(serviceId).get();
    if (!serviceDoc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Service not found' })
      };
    }
    const serviceData = serviceDoc.data();
    // Provjera da usluga pripada istom shopu/korisniku
    if (shopId) {
      if (serviceData.shopId !== shopId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Service does not belong to this shop' })
        };
      }
    } else {
      if (serviceData.userId !== userId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Service does not belong to this shop' })
        };
      }
    }
    const durationMinutes = serviceData.trajanje_minuta || 30;
    const { dayHours } = getWorkingDayDetails(date, userData.workingHours);
    
    // Check timeOff: both user-specific and shop-wide (if shop exists)
    const timeOffEntries = [];
    // Get user-specific timeOff
    const userTimeOffSnap = await db.collection('timeOff')
      .where('userId', '==', userId)
      .get();
    userTimeOffSnap.docs.forEach(doc => timeOffEntries.push(doc.data()));
    // If shop exists, get shop-wide timeOff
    if (shopId) {
      const shopTimeOffSnap = await db.collection('timeOff')
        .where('shopId', '==', shopId)
        .get();
      shopTimeOffSnap.docs.forEach(doc => {
        const data = doc.data();
        // Avoid duplicates if entry already has userId (user-specific)
        if (!data.userId) {
          timeOffEntries.push(data);
        }
      });
    }
      
    const isDateOff = timeOffEntries.some(entry => {
      if (!entry.endDate) {
        return entry.date === date;
      } else {
        return entry.date <= date && entry.endDate >= date;
      }
    });
    
    if (isDateOff) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Slot no longer available' })
      };
    }

    // Use Firestore transaction to check slot availability and create appointment
    const result = await db.runTransaction(async (transaction) => {
      // Get all existing appointments for the date (check both userId and shopId)
      let appointmentsQuery;
      let servicesQuery;
      if (shopId) {
        appointmentsQuery = db.collection('appointments')
          .where('shopId', '==', shopId)
          .where('datum', '==', date);
        servicesQuery = db.collection('services').where('shopId', '==', shopId);
      } else {
        appointmentsQuery = db.collection('appointments')
          .where('userId', '==', userId)
          .where('datum', '==', date);
        servicesQuery = db.collection('services').where('userId', '==', userId);
      }
      
      const [appointmentsSnapshot, servicesSnapshot] = await Promise.all([
        transaction.get(appointmentsQuery),
        transaction.get(servicesQuery)
      ]);
      
      const appointments = appointmentsSnapshot.docs.map((doc) => doc.data());
      const services = servicesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const serviceDurationLookups = buildServiceDurationLookups(services);
      
      const isAvailable = isTimeSlotAvailable({
        dayHours,
        time,
        durationMinutes,
        appointments,
        serviceDurationLookups
      });
      
      if (!isAvailable) {
        throw new Error('Slot no longer available');
      }

      // Create appointment document using the app's field names
      const appointmentRef = db.collection('appointments').doc();
      transaction.set(appointmentRef, {
        id: appointmentRef.id,
        userId,
        shopId: shopId || null,
        datum: date,
        vrijeme: time,
        klijent: await encrypt(clientName),
        telefon: await encrypt(clientPhone),
        email: clientEmail || '',
        napomena: note || '',
        serviceId,
        usluga: serviceData.name || '', // serviceData.name is already encrypted in Firestore
        userName: userData.name || '',
        source: 'public_booking',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return { appointmentId: appointmentRef.id, serviceName: serviceData.name };
    });

    // TODO: Add email notification to owner here (Firebase Trigger Email extension)
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        appointmentId: result.appointmentId,
        serviceName: result.serviceName
      })
    };

  } catch (error) {
    console.error('Error:', error);
    
    if (error.message === 'Slot no longer available') {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: 'Slot no longer available' })
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
