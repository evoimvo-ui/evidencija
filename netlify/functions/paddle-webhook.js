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
function verifySignature(signatureHeader, rawBody, secret) {
  if (!signatureHeader || !rawBody || !secret) {
    console.error('[Verify] Missing required params');
    return false;
  }

  const parts = signatureHeader.split(';');
  const tsPart = parts.find(p => p.startsWith('ts='));
  const v1Part = parts.find(p => p.startsWith('v1='));

  if (!tsPart || !v1Part) {
    console.error('[Verify] Missing ts or v1');
    return false;
  }

  const timestamp = tsPart.split('=')[1];
  const receivedSignature = v1Part.split('=')[1];

  const payload = `${timestamp}:${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  console.log('[Verify] Expected:', expectedSignature);
  console.log('[Verify] Received:', receivedSignature);

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(receivedSignature)
    );
  } catch (e) {
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const signature = event.headers['paddle-signature'];
  const rawBody = event.body;
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET;

  // 1. VERIFIKACIJA POTPISA
  if (!verifySignature(signature, rawBody, webhookSecret)) {
    console.error('[Paddle Webhook] Verifikacija potpisa neuspješna.');
    return { statusCode: 401, body: 'Unauthorized: Invalid Signature' };
  }

  try {
    const body = JSON.parse(rawBody);
    const eventType = body.event_type;
    const data = body.data;
    
    // Paddle v2 format: data.customer_id
    const customerId = data.customer_id;
    const subscriptionId = data.subscription_id || null;

    console.log(`[Paddle Webhook] Event: ${eventType}, Customer: ${customerId}`);

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

    if (snapshot.empty) {
      // Ako nismo našli po customerId, možda je ovo prvi event i trebamo naći po custom_data/passthrough
      // U Paddle v2, custom_data se nalazi u data.custom_data
      const userIdFromCustomData = data.custom_data ? data.custom_data.userId : null;
      
      if (userIdFromCustomData) {
        console.log(`[Paddle Webhook] Korisnik nađen preko custom_data: ${userIdFromCustomData}`);
        await usersRef.doc(userIdFromCustomData).update({
          subscriptionStatus: newStatus,
          subscriptionId: subscriptionId,
          paddleCustomerId: customerId,
          subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        console.warn(`[Paddle Webhook] Korisnik sa customerId ${customerId} nije pronađen u bazi.`);
        return { statusCode: 200, body: 'User not found' };
      }
    } else {
      const userDoc = snapshot.docs[0];
      await userDoc.ref.update({
        subscriptionStatus: newStatus,
        subscriptionId: subscriptionId,
        paddleCustomerId: customerId,
        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[Paddle Webhook] Status ažuriran za korisnika ${userDoc.id}: ${newStatus}`);
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
