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

const db = admin.firestore();exports.handler = async (event) => {
  try {
    const { slug } = event.queryStringParameters;
    
    if (!slug) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing slug parameter' })
      };
    }

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

    // Get services - check both userId and shopId
    let servicesQuery;
    if (shopId) {
      servicesQuery = db.collection('services').where('shopId', '==', shopId);
    } else {
      servicesQuery = db.collection('services').where('userId', '==', userId);
    }
    const servicesSnapshot = await servicesQuery.get();
    const services = [];
    servicesSnapshot.forEach(doc => {
      services.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        userData,
        services
      })
    };

  } catch (error) {
    console.error('Error getting public user:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
