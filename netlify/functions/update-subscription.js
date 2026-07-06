/**
 * netlify/functions/update-subscription.js
 * Servis za upravljanje pretplatom preko Paddle API-ja.
 */

const Sentry = require('@sentry/node');
Sentry.init({ dsn: 'https://de9a89b4821f581bfe0184753058164e@o4511571182485504.ingest.de.sentry.io/4511571327647824' });

const admin = require('firebase-admin');

// Inicijalizacija Firebase Admin SDK
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

// Paddle API konfiguracija
const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_BASE_URL = 'https://api.paddle.com';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { userId, autoRenewal } = JSON.parse(event.body);

    // Dohvati korisnika iz Firestore
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'User not found' }) };
    }

    const userData = userDoc.data();
    const subscriptionId = userData.subscriptionId;

    if (!subscriptionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No subscription found' }) };
    }

    // Ažuriraj pretplatu preko Paddle API-ja
    const paddleResponse = await fetch(`${PADDLE_BASE_URL}/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${PADDLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        cancel_at_period_end: !autoRenewal
      })
    });

    if (!paddleResponse.ok) {
      const errorText = await paddleResponse.text();
      console.error('[Paddle API] Error:', paddleResponse.status, errorText);
      throw new Error('Failed to update subscription in Paddle');
    }

    // Ažuriraj Firestore
    await db.collection('users').doc(userId).update({
      cancelAtPeriodEnd: !autoRenewal,
      subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('[Update Subscription] Error:', error.message);
    Sentry.captureException(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
