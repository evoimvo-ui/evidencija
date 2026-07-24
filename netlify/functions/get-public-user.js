const admin = require('firebase-admin');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.BOOKING_ENCRYPTION_KEY;
const OLD_ENCRYPTION_KEY = 'evidencija-ex-key-2024';
const SALT = process.env.BOOKING_ENCRYPTION_SALT;
const OLD_SALT = 'evidencija-fixed-salt-2024';

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

// Helper functions for encryption/decryption (matches our frontend code)
async function getEncryptionKey(keyText = ENCRYPTION_KEY, saltText = SALT) {
  if (!keyText) return null;
  return crypto.pbkdf2Sync(
    keyText,
    Buffer.from(saltText),
    100000,
    32,
    'sha256'
  );
}

async function decrypt(encoded, keyText = ENCRYPTION_KEY, saltText = SALT) {
  if (!encoded) return encoded;
  try {
    const combined = Buffer.from(encoded, 'base64');
    if (combined.length < 28) throw new Error("Invalid cipher text or IV missing"); // IV (12) + at least 16 bytes data/tag
    
    const iv = combined.slice(0, 12);
    const ciphertextAndTag = combined.slice(12);
    const tagLength = 16; // AES-GCM standard tag length
    const ciphertext = ciphertextAndTag.slice(0, ciphertextAndTag.length - tagLength);
    const authTag = ciphertextAndTag.slice(ciphertextAndTag.length - tagLength);
    
    const key = await getEncryptionKey(keyText, saltText);
    if (!key) throw new Error("Encryption key missing");
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    // Try legacy decrypt (XOR method) if AES fails
    try {
      return legacyDecrypt(encoded, OLD_ENCRYPTION_KEY);
    } catch (legacyErr) {
      console.error("Decryption error:", e);
      return encoded;
    }
  }
}

function legacyDecrypt(encoded, keyText = OLD_ENCRYPTION_KEY) {
  if (!encoded) return encoded;
  try {
    const text = Buffer.from(encoded, 'base64').toString('binary');
    const decrypted = text.split('').map((char, i) => 
      String.fromCharCode(char.charCodeAt(0) ^ keyText.charCodeAt(i % keyText.length))
    ).join('');
    return decodeURIComponent(escape(decrypted));
  } catch (e) {
    return encoded;
  }
}

exports.handler = async (event) => {
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
    
    const bookingSlugData = bookingSlugDoc.data();
    const ownerUserId = bookingSlugData.userId;
    const workerId = bookingSlugData.workerId;
    
    const ownerUserDoc = await db.collection('users').doc(ownerUserId).get();
    if (!ownerUserDoc.exists) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }
    const ownerUserData = ownerUserDoc.data();
    const shopId = ownerUserData.shopId;
    
    // Determine effective user data
    let effectiveUserData;
    if (workerId) {
      const workerDoc = await db.collection('users').doc(workerId).get();
      if (!workerDoc.exists) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Worker not found' })
        };
      }
      effectiveUserData = workerDoc.data();
    } else {
      effectiveUserData = ownerUserData;
    }
    
    let businessName = effectiveUserData.name || 'Book Appointment';
    if (shopId) {
      const shopDoc = await db.collection('shops').doc(shopId).get();
      if (shopDoc.exists) {
        businessName = shopDoc.data().name || businessName;
      }
    }

    // Get shop workers if this is a shop
    let shopWorkers = [];
    if (shopId) {
      const workersSnapshot = await db.collection('users').where('shopId', '==', shopId).get();
      shopWorkers = workersSnapshot.docs.map(doc => {
        const data = doc.data();
        // Only return public fields
        return {
          id: doc.id,
          name: data.name,
          photoURL: data.photoURL,
          workingHours: data.workingHours
        };
      });
    }

    // Get services - shared shop services + worker's personal services
    let shopServices = [];
    let userServices = [];
    
    if (shopId) {
      const shopServicesQuery = db.collection('services').where('shopId', '==', shopId);
      const shopServicesSnapshot = await shopServicesQuery.get();
      shopServices = shopServicesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    }
    
    const effectiveUserId = workerId || ownerUserId;
    const userServicesQuery = db.collection('services').where('userId', '==', effectiveUserId);
    const userServicesSnapshot = await userServicesQuery.get();
    userServices = userServicesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    
    // Combine and deduplicate services
    const serviceIds = new Set();
    const uniqueServices = [];
    const allServices = [...shopServices, ...userServices];
    for (const service of allServices) {
      if (!serviceIds.has(service.id)) {
        serviceIds.add(service.id);
        uniqueServices.push(service);
      }
    }
    console.log('[get-public-user] Unique services count:', uniqueServices.length);
    const services = [];
    
    for (const serviceData of uniqueServices) {
      console.log('[get-public-user] Service:', serviceData);
      
      // Decrypt service name
      if (serviceData.name) {
        let decrypted = null;
        const attempts = [
          [ENCRYPTION_KEY, SALT],
          [OLD_ENCRYPTION_KEY, SALT],
          [ENCRYPTION_KEY, OLD_SALT],
          [OLD_ENCRYPTION_KEY, OLD_SALT]
        ];
        for (const [k, s] of attempts) {
          if (!k) continue;
          try {
            decrypted = await decrypt(serviceData.name, k, s);
            if (decrypted && decrypted !== serviceData.name) {
              break;
            }
          } catch (e) {
            // continue to next attempt
          }
        }
        if (decrypted) {
          serviceData.name = decrypted;
        }
      }
      
      services.push(serviceData);
    }
    console.log('[get-public-user] Services array:', services);

    // Only expose public fields for the effective user
    const publicUserData = {
      uid: effectiveUserData.uid,
      name: effectiveUserData.name,
      photoURL: effectiveUserData.photoURL,
      workingHours: effectiveUserData.workingHours,
      businessName
    };
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        userData: publicUserData,
        services,
        isWorkerSpecific: !!workerId,
        shopWorkers
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
