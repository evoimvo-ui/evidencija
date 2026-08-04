const admin = require('firebase-admin');
const crypto = require('crypto');
const {
  buildServiceDurationLookups,
  getWorkingDayDetails,
  isTimeSlotAvailable
} = require('./booking-availability');

const ENCRYPTION_KEY = process.env.BOOKING_ENCRYPTION_KEY;
const SALT = process.env.BOOKING_ENCRYPTION_SALT;

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

async function workerBelongsToShop(workerId, shopId, dbInstance) {
  if (!shopId || !workerId) return false;
  const workerDoc = await dbInstance.collection('users').doc(workerId).get();
  if (!workerDoc.exists) return false;
  return workerDoc.data().shopId === shopId;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const body = JSON.parse(event.body);
    const { slug, date, time, serviceId, clientName, clientPhone, clientEmail, note, website, workerId: bodyWorkerId } = body;

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
    
    const bookingSlugData = bookingSlugDoc.data();
    const ownerUserId = bookingSlugData.userId;
    const slugWorkerId = bookingSlugData.workerId;
    const userDoc = await db.collection('users').doc(ownerUserId).get();
    if (!userDoc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    
    const userData = userDoc.data();
    const shopId = userData.shopId;
    
    // Determine effective userId for the new appointment
    let effectiveUserId;
    if (slugWorkerId) {
      effectiveUserId = slugWorkerId;
    } else if (bodyWorkerId) {
      const isValidWorker = await workerBelongsToShop(bodyWorkerId, shopId, db);
      if (!isValidWorker) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Worker does not belong to this shop' })
        };
      }
      effectiveUserId = bodyWorkerId;
    } else {
      effectiveUserId = ownerUserId;
    }

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
      if (serviceData.userId !== ownerUserId) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Service does not belong to this shop' })
        };
      }
    }
    const durationMinutes = serviceData.trajanje_minuta || 30;
    
    // Get effective user's working hours
    let effectiveWorkingHours;
    if (effectiveUserId !== ownerUserId) {
      const effectiveUserDoc = await db.collection('users').doc(effectiveUserId).get();
      if (effectiveUserDoc.exists) {
        effectiveWorkingHours = effectiveUserDoc.data().workingHours;
      } else {
        effectiveWorkingHours = userData.workingHours;
      }
    } else {
      effectiveWorkingHours = userData.workingHours;
    }
    
    const { dayHours } = getWorkingDayDetails(date, effectiveWorkingHours);
    
    // Check timeOff: both effective user-specific and shop-wide (if shop exists)
    const timeOffEntries = [];
    // Get effective user-specific timeOff
    const userTimeOffSnap = await db.collection('timeOff')
      .where('userId', '==', effectiveUserId)
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
      // Get all existing appointments for the date
      let appointmentsQuery;
      let servicesQuery;
      if (slugWorkerId || bodyWorkerId) {
        // Worker-specific: only appointments for effectiveUserId
        appointmentsQuery = db.collection('appointments')
          .where('userId', '==', effectiveUserId)
          .where('datum', '==', date);
      } else if (shopId) {
        // Shop-wide: all appointments for the shop
        appointmentsQuery = db.collection('appointments')
          .where('shopId', '==', shopId)
          .where('datum', '==', date);
      } else {
        // Individual user: appointments for ownerUserId
        appointmentsQuery = db.collection('appointments')
          .where('userId', '==', ownerUserId)
          .where('datum', '==', date);
      }
      
      if (shopId) {
        servicesQuery = db.collection('services').where('shopId', '==', shopId);
      } else {
        servicesQuery = db.collection('services').where('userId', '==', ownerUserId);
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

      // Get effective user's name for userName field
      let effectiveUserName = userData.name || '';
      if (effectiveUserId !== ownerUserId) {
        const effectiveUserDoc = await db.collection('users').doc(effectiveUserId).get();
        if (effectiveUserDoc.exists) {
          effectiveUserName = effectiveUserDoc.data().name || '';
        }
      }
      
      // Create appointment document using the app's field names
      const appointmentRef = db.collection('appointments').doc();
      transaction.set(appointmentRef, {
        id: appointmentRef.id,
        userId: effectiveUserId,
        shopId: shopId || null,
        datum: date,
        vrijeme: time,
        klijent: await encrypt(clientName),
        telefon: await encrypt(clientPhone),
        email: clientEmail ? await encrypt(clientEmail) : '',
        napomena: note || '',
        serviceId,
        usluga: serviceData.name || '', // serviceData.name is already encrypted in Firestore
        userName: effectiveUserName,
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
