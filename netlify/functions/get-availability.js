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
    const { slug, date, serviceId } = event.queryStringParameters;
    
    if (!slug || !date || !serviceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }

    // Find user by bookingSlug
    const usersSnapshot = await db.collection('users').where('bookingSlug', '==', slug).limit(1).get();
    if (usersSnapshot.empty) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data();
    const shopId = userData.shopId;

    // Get working hours for the day of week
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Map getDay() to key
    const workingHours = userData.workingHours || {};
    const dayHours = workingHours[dayKeys[dayOfWeek]];
    
    if (!dayHours || !dayHours.active) {
      return {
        statusCode: 200,
        body: JSON.stringify({ slots: [] })
      };
    }

    // Check timeOff
    const timeOffSnapshot = await db.collection('timeOff')
      .where('userId', '==', userId)
      .get();
      
    const timeOffEntries = timeOffSnapshot.docs.map(doc => doc.data());
    const isDateOff = timeOffEntries.some(entry => {
      if (!entry.endDate) {
        return entry.date === date;
      } else {
        return entry.date <= date && entry.endDate >= date;
      }
    });
    
    if (isDateOff) {
      return {
        statusCode: 200,
        body: JSON.stringify({ slots: [] })
      };
    }

    // Get service duration from services collection
    const serviceDoc = await db.collection('services').doc(serviceId).get();
    if (!serviceDoc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Service not found' })
      };
    }
    
    const serviceData = serviceDoc.data();
    const durationMinutes = serviceData.trajanje_minuta || 30;

    // Generate candidate slots
    const slots = [];
    const [fromHour, fromMin] = dayHours.from.split(':').map(Number);
    const [toHour, toMin] = dayHours.to.split(':').map(Number);
    
    let currentMinutes = fromHour * 60 + fromMin;
    const endMinutes = toHour * 60 + toMin;
    
    while (currentMinutes + durationMinutes <= endMinutes) {
      const hour = Math.floor(currentMinutes / 60).toString().padStart(2, '0');
      const min = (currentMinutes % 60).toString().padStart(2, '0');
      slots.push(`${hour}:${min}`);
      currentMinutes += durationMinutes;
    }

    // Get existing appointments for that date (check both userId and shopId)
    let appointmentsQuery;
    if (shopId) {
      appointmentsQuery = db.collection('appointments')
        .where('shopId', '==', shopId)
        .where('date', '==', date);
    } else {
      appointmentsQuery = db.collection('appointments')
        .where('userId', '==', userId)
        .where('date', '==', date);
    }
    const appointmentsSnapshot = await appointmentsQuery.get();
      
    const bookedSlots = [];
    appointmentsSnapshot.docs.forEach(doc => {
      const appt = doc.data();
      bookedSlots.push(appt.vrijeme || appt.time); // Handle both old and new field names
    });

    // Filter out booked slots
    let availableSlots = slots.filter(slot => !bookedSlots.includes(slot));

    // If today, filter out past slots plus 30 minutes
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);
    
    if (today.getTime() === dateOnly.getTime()) {
      const now = new Date();
      const nowPlus30 = new Date(now.getTime() + 30 * 60000);
      const nowHour = nowPlus30.getHours();
      const nowMin = nowPlus30.getMinutes();
      const nowTotalMinutes = nowHour * 60 + nowMin;
      
      availableSlots = availableSlots.filter(slot => {
        const [h, m] = slot.split(':').map(Number);
        return h * 60 + m >= nowTotalMinutes;
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ slots: availableSlots, userData, serviceData })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
