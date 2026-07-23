const admin = require('firebase-admin');
const crypto = require('crypto');

const ENCRYPTION_KEY = 'pustopoljina-evidencija-v2';
const OLD_ENCRYPTION_KEY = 'evidencija-ex-key-2024';
const SALT = 'evidencija-fixed-salt-2026';
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
    if (combined.length < 13) throw new Error("Invalid cipher text or IV missing");
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const key = await getEncryptionKey(keyText, saltText);
    if (!key) throw new Error("Encryption key missing");
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    let decrypted = decipher.update(data);
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
    
    let businessName = userData.name || 'Book Appointment';
    if (shopId) {
      const shopDoc = await db.collection('shops').doc(shopId).get();
      if (shopDoc.exists) {
        businessName = shopDoc.data().name || businessName;
      }
    }

    // Get services - check both userId and shopId
    let servicesQuery;
    if (shopId) {
      servicesQuery = db.collection('services').where('shopId', '==', shopId);
    } else {
      servicesQuery = db.collection('services').where('userId', '==', userId);
    }
    const servicesSnapshot = await servicesQuery.get();
    const services = [];
    
    for (const doc of servicesSnapshot.docs) {
      const serviceData = { id: doc.id, ...doc.data() };
      
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

    return {
      statusCode: 200,
      body: JSON.stringify({
        userData: {
          ...userData,
          businessName
        },
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
