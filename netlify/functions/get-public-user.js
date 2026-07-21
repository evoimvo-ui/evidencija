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

    const usersSnapshot = await db.collection('users').where('bookingSlug', '==', slug).limit(1).get();
    
    if (usersSnapshot.empty) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;
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
