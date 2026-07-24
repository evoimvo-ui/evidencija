const admin = require('firebase-admin');
const {
  buildServiceDurationLookups,
  generateAvailableStartTimes,
  getWorkingDayDetails
} = require('./booking-availability');

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
    const { slug, date, serviceId, workerId } = event.queryStringParameters;
    
    console.log('[get-availability] Params:', { slug, date, serviceId, workerId });
    
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
    
    // Determine effective user (worker or main user) and their working hours
    let effectiveUserId;
    let effectiveWorkingHours;
    if (workerId) {
      // Get worker-specific data
      const workerDoc = await db.collection('users').doc(workerId).get();
      if (!workerDoc.exists) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Worker not found' })
        };
      }
      effectiveUserId = workerId;
      effectiveWorkingHours = workerDoc.data().workingHours;
    } else {
      // Use main user/shop logic
      effectiveUserId = userId;
      effectiveWorkingHours = userData.workingHours;
    }
    
    console.log('[get-availability] User data:', { userId, shopId, workerId, effectiveUserId, effectiveWorkingHours });

    // Get working hours for the day of week
    const { dayOfWeek, dayKey, dayHours } = getWorkingDayDetails(date, effectiveWorkingHours);
    
    console.log('[get-availability] Day hours:', { dayOfWeek, dayKey, dayHours });
    
    if (!dayHours || !dayHours.active || !dayHours.from || !dayHours.to) {
      return {
        statusCode: 200,
        body: JSON.stringify({ slots: [] })
      };
    }

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

    // Get existing appointments for that date
    let appointmentsQuery;
    if (workerId) {
      // Worker-specific: only appointments for this worker
      appointmentsQuery = db.collection('appointments')
        .where('userId', '==', workerId)
        .where('datum', '==', date);
    } else {
      // Original logic: shop-wide if shopId, else user-wide
      if (shopId) {
        appointmentsQuery = db.collection('appointments')
          .where('shopId', '==', shopId)
          .where('datum', '==', date);
      } else {
        appointmentsQuery = db.collection('appointments')
          .where('userId', '==', userId)
          .where('datum', '==', date);
      }
    }
    const appointmentsSnapshot = await appointmentsQuery.get();
    const servicesQuery = shopId
      ? db.collection('services').where('shopId', '==', shopId)
      : db.collection('services').where('userId', '==', userId);
    const servicesSnapshot = await servicesQuery.get();
      
    const appointments = appointmentsSnapshot.docs.map((doc) => doc.data());
    const services = servicesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const serviceDurationLookups = buildServiceDurationLookups(services);
    const existingIntervals = appointments.map((appointment) => ({
      vrijeme: appointment.vrijeme || appointment.time,
      serviceId: appointment.serviceId || null,
      usluga: appointment.usluga || appointment.service || null
    }));

    console.log('[get-availability] Existing appointments:', existingIntervals);

    let availableSlots = generateAvailableStartTimes({
      dayHours,
      durationMinutes,
      appointments,
      serviceDurationLookups
    });
    
    console.log('[get-availability] Available slots after overlap filtering:', availableSlots);

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
