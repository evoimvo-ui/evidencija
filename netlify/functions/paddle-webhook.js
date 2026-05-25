/**
 * netlify/functions/paddle-webhook.js
 * Pozadinski servis za obradu Paddle Billing (v2) Webhook-ova.
 */

const admin = require('firebase-admin');
const crypto = require('crypto');

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

/**
 * Verifikacija Paddle v2 potpisa
 */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sigHeader = event.headers['paddle-signature'];
  const rawBody = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8').toString('utf8');
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

  if (!sigHeader || !webhookSecret) {
    console.error('[Verify] Missing signature header or webhook secret');
    return { statusCode: 401, body: 'Missing required parameters' };
  }

  // 1. VERIFIKACIJA POTPISA
  try {
    const parts = Object.fromEntries(sigHeader.split(';').map(p => p.split('=')));
    const timestamp = parts['ts'];
    const h1 = parts['h1'];

    if (!timestamp || !h1) {
      console.error('[Verify] Missing ts or h1 in header');
      return { statusCode: 401, body: 'Invalid signature format' };
    }

    const signedPayload = `${timestamp}:${rawBody}`;
    const hmac = crypto.createHmac('sha256', webhookSecret);
    hmac.update(signedPayload);
    const computedSignature = hmac.digest('hex');

    if (computedSignature !== h1) {
      console.error('[Verify] Signature mismatch');
      console.log('[Verify] Computed:', computedSignature);
      console.log('[Verify] Received:', h1);
      return { statusCode: 401, body: 'Invalid signature' };
    }
  } catch (err) {
    console.error('[Verify] Error during verification:', err.message);
    return { statusCode: 401, body: 'Error during verification' };
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.event_type;
    const data = body.data;
    
    // Paddle v2 format: data.customer_id
    const customerId = data.customer_id;
    const subscriptionId = data.subscription_id || null;
    const planFromCustomData = data.custom_data ? data.custom_data.plan : null;

    console.log(`[Paddle Webhook] Event: ${eventType}, Customer: ${customerId}, Plan: ${planFromCustomData}`);

    // 2. MAPIRANJE EVENTA NA STATUS
    let newStatus = null;
    switch (eventType) {
      case 'subscription.activated':
      case 'subscription.resumed':
      case 'transaction.completed':
        newStatus = 'active';
        break;
      case 'subscription.cancelled':
        newStatus = 'cancelled';
        break;
      case 'subscription.paused':
        newStatus = 'paused';
        break;
      default:
        console.log(`[Paddle Webhook] Ignorišem event tip: ${eventType}`);
        return { statusCode: 200, body: 'Event type ignored' };
    }

    // 3. FIRESTORE UPDATE
    // Tražimo korisnika po paddleCustomerId
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('paddleCustomerId', '==', customerId).limit(1).get();

    const updateData = {
      subscriptionStatus: newStatus,
      subscriptionId: subscriptionId,
      paddleCustomerId: customerId,
      subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Ako imamo plan u custom_data, spremamo ga
    if (planFromCustomData) {
      updateData.subscriptionPlan = planFromCustomData;
    }

    if (snapshot.empty) {
      // Ako nismo našli po customerId, možda je ovo prvi event i trebamo naći po custom_data/userId
      const userIdFromCustomData = data.custom_data ? data.custom_data.userId : null;
      
      if (userIdFromCustomData) {
        console.log(`[Paddle Webhook] Korisnik nađen preko custom_data: ${userIdFromCustomData}`);
        await usersRef.doc(userIdFromCustomData).update(updateData);
      } else {
        console.warn(`[Paddle Webhook] Korisnik sa customerId ${customerId} nije pronađen u bazi.`);
        return { statusCode: 200, body: 'User not found' };
      }
    } else {
      const userDoc = snapshot.docs[0];
      await userDoc.ref.update(updateData);
      console.log(`[Paddle Webhook] Status ažuriran za korisnika ${userDoc.id}: ${newStatus} (${planFromCustomData || 'n/a'})`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, status: newStatus })
    };

  } catch (err) {
    console.error('[Paddle Webhook] Sistemska greška:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
