const admin = require('firebase-admin');

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

    // Use Firestore transaction to check slot availability and create appointment
    const result = await db.runTransaction(async (transaction) => {
      // Check if slot is still available (check both userId and shopId)
      let query;
      if (shopId) {
        query = db.collection('appointments')
          .where('shopId', '==', shopId)
          .where('date', '==', date)
          .where('vrijeme', '==', time);
      } else {
        query = db.collection('appointments')
          .where('userId', '==', userId)
          .where('date', '==', date)
          .where('vrijeme', '==', time);
      }
      const existingAppts = await transaction.get(query);
      
      if (!existingAppts.empty) {
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
        klijent: clientName,
        telefon: clientPhone,
        email: clientEmail || '',
        napomena: note || '',
        serviceId,
        usluga: serviceData.name || '',
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
