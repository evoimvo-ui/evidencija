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

// Default working hours
const DEFAULT_WORKING_HOURS = {
  mon: { active: true, from: '09:00', to: '17:00' },
  tue: { active: true, from: '09:00', to: '17:00' },
  wed: { active: true, from: '09:00', to: '17:00' },
  thu: { active: true, from: '09:00', to: '17:00' },
  fri: { active: true, from: '09:00', to: '17:00' },
  sat: { active: false, from: '09:00', to: '17:00' },
  sun: { active: false, from: '09:00', to: '17:00' }
};

exports.handler = async (event) => {
  try {
    const { slug, date, serviceId } = event.queryStringParameters;
    
    console.log('[get-availability] Params:', { slug, date, serviceId });
    
    if (!slug || !date || !serviceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required parameters' })
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
    
    console.log('[get-availability] User data:', { userId, shopId, workingHours: userData.workingHours });

    // Get working hours for the day of week
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day); // months are 0-indexed
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']; // Map getDay() to key
    const workingHours = { ...DEFAULT_WORKING_HOURS, ...userData.workingHours };
    const dayHours = workingHours[dayKeys[dayOfWeek]];
    
    console.log('[get-availability] Day hours:', { dayOfWeek, dayKey: dayKeys[dayOfWeek], dayHours });
    
    if (!dayHours || !dayHours.active || !dayHours.from || !dayHours.to) {
      return {
        statusCode: 200,
        body: JSON.stringify({ slots: [] })
      };
    }

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
    console.log('[get-availability] Service data:', serviceData);
    const durationMinutes = serviceData.trajanje_minuta || 30;

    // Generate candidate slots
    const slots = [];
    const [fromHour, fromMin] = dayHours.from.split(':').map(Number);
    const [toHour, toMin] = dayHours.to.split(':').map(Number);
    
    console.log('[get-availability] Time range:', { fromHour, fromMin, toHour, toMin, durationMinutes });
    
    let currentMinutes = fromHour * 60 + fromMin;
    const endMinutes = toHour * 60 + toMin;
    
    while (currentMinutes + durationMinutes <= endMinutes) {
      const hour = Math.floor(currentMinutes / 60).toString().padStart(2, '0');
      const min = (currentMinutes % 60).toString().padStart(2, '0');
      slots.push(`${hour}:${min}`);
      currentMinutes += durationMinutes;
    }
    
    console.log('[get-availability] Generated slots:', slots);

    // Get existing appointments for that date (check both userId and shopId)
    let appointmentsQuery;
    if (shopId) {
      appointmentsQuery = db.collection('appointments')
        .where('shopId', '==', shopId)
        .where('datum', '==', date);
    } else {
      appointmentsQuery = db.collection('appointments')
        .where('userId', '==', userId)
        .where('datum', '==', date);
    }
    const appointmentsSnapshot = await appointmentsQuery.get();
      
    const bookedSlots = [];
    appointmentsSnapshot.docs.forEach(doc => {
      const appt = doc.data();
      bookedSlots.push(appt.vrijeme || appt.time); // Handle both old and new field names
    });
    
    console.log('[get-availability] Booked slots:', bookedSlots);

    // Filter out booked slots
    let availableSlots = slots.filter(slot => !bookedSlots.includes(slot));
    
    console.log('[get-availability] Available slots after filtering booked:', availableSlots);

    // If today, filter out past slots plus 30 minutes
    const now = new Date();
    // Get today's date in local time (YYYY-MM-DD)
    const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    const isToday = todayStr === date;
    
    console.log('[get-availability] Today check:', { todayStr, selectedDate: date, isToday });
    
    if (isToday) {
      const nowPlus30 = new Date(now.getTime() + 30 * 60000);
      // Get hours and minutes in local time (or use UTC? Let's use local for now)
      const nowHour = nowPlus30.getHours();
      const nowMin = nowPlus30.getMinutes();
      const nowTotalMinutes = nowHour * 60 + nowMin;
      
      console.log('[get-availability] Today, filtering slots after:', `${nowHour}:${nowMin}`);
      
      availableSlots = availableSlots.filter(slot => {
        const [h, m] = slot.split(':').map(Number);
        return h * 60 + m >= nowTotalMinutes;
      });
      
      console.log('[get-availability] Available slots after filtering time:', availableSlots);
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
