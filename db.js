import { CONFIG } from './config.js';

// Utility for robust encryption using Web Crypto API
const ENCRYPTION_KEY = CONFIG.ENCRYPTION_KEY;
const OLD_ENCRYPTION_KEY = CONFIG.OLD_ENCRYPTION_KEY;
const SALT = 'evidencija-fixed-salt-2026'; 
const OLD_SALT = 'evidencija-fixed-salt-2024'; // Potencijalna stara so

let _keyCache = {};

async function getEncryptionKey(keyText = ENCRYPTION_KEY, saltText = SALT) {
  if (!keyText) return null;
  const cacheKey = `${keyText}:${saltText}`;
  if (_keyCache[cacheKey]) {
    return _keyCache[cacheKey];
  }

  const derivationPromise = (async () => {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(keyText),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode(saltText),
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  })();

  _keyCache[cacheKey] = derivationPromise;
  return derivationPromise;
}

async function encrypt(text) {
  if (!text) return text;
  try {
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      enc.encode(text)
    );
    
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Koristi Blob za pretvorbu u Base64, što je robustnije za binarne podatke
    // ili koristite ArrayBuffer to string pa btoa (ali to je sličan problem)
    // Najjednostavnije je direktno konvertirati Uint8Array u Base64 string.
    const binaryString = String.fromCharCode.apply(null, combined);
    return btoa(binaryString);
  } catch (e) {
    console.error("Encryption error:", e);
    throw e; // Propagiraj grešku dalje
  }
}

async function decrypt(encoded, keyText = ENCRYPTION_KEY, saltText = SALT) {
  if (!encoded) return encoded;
  try {
    // Dekodiraj Base64 string u binarni string
    const binaryString = atob(encoded);
    // Pretvori binarni string u Uint8Array
    const combined = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      combined[i] = binaryString.charCodeAt(i);
    }

    if (combined.length < 13) throw new Error("Invalid cipher text or IV missing");
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const key = await getEncryptionKey(keyText, saltText);
    if (!key) throw new Error("Encryption key missing");
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // Ne logiramo OperationError ovdje jer ćemo ga možda hendlati fallbackom
    if (e.name !== 'OperationError') {
      console.error("Decryption error:", e);
    }
    throw e; // Propagiraj grešku dalje
  }
}

// Funkcija za legacy dešifriranje (XOR metoda)
function legacyDecrypt(encoded, keyText = OLD_ENCRYPTION_KEY) {
  if (!encoded) return encoded;
  try {
    const text = atob(encoded);
    const decrypted = text.split('').map((char, i) => 
      String.fromCharCode(char.charCodeAt(0) ^ keyText.charCodeAt(i % keyText.length))
    ).join('');
    return decodeURIComponent(escape(decrypted));
  } catch (e) {
    return encoded;
  }
}

// IndexedDB Wrapper
const DB_NAME = 'EvidencijaDB';
const DB_VERSION = 2; // Povećano sa 1 na 2 radi dodavanja novih store-ova

export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('entries')) {
        db.createObjectStore('entries', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('appointments')) {
        db.createObjectStore('appointments', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('services')) {
        db.createObjectStore('services', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

export async function saveData(storeName, data) {
  try {
    const db = await initDB();
    
    const processedData = { ...data };
    // Add default for trajanje_minuta if storeName is 'services' and field is missing
    if (storeName === 'services' && processedData.trajanje_minuta === undefined) {
      processedData.trajanje_minuta = 60;
    }
    if (processedData.debtor) processedData.debtor = await encrypt(processedData.debtor);
    if (processedData.telefon) processedData.telefon = await encrypt(processedData.telefon);
    if (processedData.klijent) processedData.klijent = await encrypt(processedData.klijent);
    if (processedData.name) processedData.name = await encrypt(processedData.name);
    if (processedData.surname) processedData.surname = await encrypt(processedData.surname);
    if (processedData.email) processedData.email = await encrypt(processedData.email);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName, 'sync_queue'], 'readwrite');
      const store = transaction.objectStore(storeName);
      const queue = transaction.objectStore('sync_queue');
      
      store.put(processedData);
      queue.add({ action: 'save', store: storeName, data: processedData, timestamp: Date.now() });
      
      transaction.oncomplete = () => {
        console.log(`[DB] Saved to ${storeName}:`, data.id);
        resolve();
      };
      transaction.onerror = () => {
        console.error(`[DB] Error saving to ${storeName}:`, transaction.error);
        reject(transaction.error);
      };
    });
  } catch (e) {
    console.error(`[DB] initDB failed:`, e);
    throw e;
  }
}

export async function getAllData(storeName, user = null) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = async () => {
      let filteredResult = request.result;
      
      // Filtriraj podatke prema korisniku ako je proslijeđen user objekt
      if (user) {
        filteredResult = request.result.filter(item => {
          // Vlasnik vidi sve što pripada njegovoj radnji (shopId)
          if (user.role === 'owner' && user.shopId) {
            return item.shopId === user.shopId;
          }
          // Radnik vidi samo svoje unose (userId) ili unose svoje radnje ako je tako konfigurisano
          // Za sada, radnici vide samo svoje (osim ako su vlasnici radnje)
          // Izuzetak su 'services' koje su često zajedničke za shop
          if (storeName === 'services' && user.shopId) {
            return item.shopId === user.shopId || item.userId === user.uid;
          }
          return item.userId === user.uid;
        });
      }

      const results = await Promise.all(filteredResult.map(async item => {
        let needsMigration = false;
        const decrypted = { ...item };
        
        const fieldsToDecrypt = ['debtor', 'telefon', 'klijent', 'name', 'surname', 'email', 'usluga'];
        
        for (const field of fieldsToDecrypt) {
          if (decrypted[field]) {
            let fieldDecrypted = false;
            
            // Lista pokušaja: [ključ, so]
            const attempts = [
              [ENCRYPTION_KEY, SALT],
              [OLD_ENCRYPTION_KEY, SALT],
              [ENCRYPTION_KEY, OLD_SALT],
              [OLD_ENCRYPTION_KEY, OLD_SALT]
            ];

            for (const [k, s] of attempts) {
              if (!k) continue;
              try {
                decrypted[field] = await decrypt(decrypted[field], k, s);
                fieldDecrypted = true;
                if (k !== ENCRYPTION_KEY || s !== SALT) needsMigration = true;
                break;
              } catch (e) {
                // Nastavi na sljedeći pokušaj
              }
            }

            if (!fieldDecrypted) {
              // Zadnji pokušaj: Legacy XOR
              const legacy = legacyDecrypt(decrypted[field], OLD_ENCRYPTION_KEY);
              if (legacy !== decrypted[field]) {
                decrypted[field] = legacy;
                needsMigration = true;
              } else {
                decrypted._corrupted = true;
              }
            }
          }
        }

        if (needsMigration) {
          console.log(`[Migration] Automatska migracija zapisa ${item.id} u ${storeName}...`);
          // Spremamo nazad (saveData će re-enkriptirati trenutnim ključem i dodati u sync_queue)
          // Koristimo setTimeout da ne blokiramo trenutnu transakciju
          setTimeout(() => {
            saveData(storeName, decrypted).catch(err => 
              console.error(`[Migration] Greška pri spremanju migriranog zapisa ${item.id}:`, err)
            );
          }, 0);
        }

        return decrypted;
      }));
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteData(storeName, id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName, 'sync_queue'], 'readwrite');
    const store = transaction.objectStore(storeName);
    const queue = transaction.objectStore('sync_queue');
    
    store.delete(id);
    queue.add({ action: 'delete', store: storeName, id: id, timestamp: Date.now() });
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Čisti sve lokalne podatke osim reda čekanja za sinkronizaciju (opcionalno).
 * Koristi se pri odjavi korisnika.
 */
export async function clearLocalData(force = false) {
  const db = await initDB();
  const stores = ['entries', 'appointments', 'services', 'clients'];
  
  // Ako nije force, provjeri ima li nesinkroniziranih podataka
  if (!force) {
    const queueCount = await new Promise((resolve) => {
      const trans = db.transaction('sync_queue', 'readonly');
      const req = trans.objectStore('sync_queue').count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(0);
    });
    
    if (queueCount > 0) {
      const confirmClear = confirm(`Imate ${queueCount} nesinkronizovanih promjena. Ako se odjavite, ovi podaci će biti izgubljeni. Želite li nastaviti?`);
      if (!confirmClear) return false;
    }
  }

  const transaction = db.transaction([...stores, 'sync_queue'], 'readwrite');
  stores.forEach(s => transaction.objectStore(s).clear());
  transaction.objectStore('sync_queue').clear();
  
  return new Promise((resolve) => {
    transaction.oncomplete = () => {
      console.log("[DB] Lokalna baza očišćena.");
      resolve(true);
    };
  });
}

// Sync logic with Firestore
import { db as fdb } from './firebase.js';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

function isTemporaryError(e) {
  if (!navigator.onLine) return true;
  const tempCodes = ['unavailable', 'deadline-exceeded', 'resource-exhausted'];
  if (e && e.code && tempCodes.includes(e.code)) return true;
  if (e && e.message && (e.message.includes('network') || e.message.includes('fetch') || e.message.includes('timeout'))) return true;
  return false;
}

let isSyncing = false;
export async function syncWithFirestore(user) {
  if (!user || !navigator.onLine || isSyncing) return;
  isSyncing = true;

  try {
    const db = await initDB();
    const queueRequest = await new Promise((resolve, reject) => {
      const transaction = db.transaction('sync_queue', 'readonly');
      const request = transaction.objectStore('sync_queue').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const items = queueRequest;
    if (items.length === 0) return;

    console.log(`[Sync] Processing ${items.length} items in queue...`);

    for (const item of items) {
      if (item.syncFailed) continue;
      
      try {
        const collectionName = item.store;
        const docId = (item.id || (item.data && item.data.id))?.toString();
        if (!docId) {
          console.warn("[Sync] Item missing ID, removing from queue:", item);
          const delTrans = db.transaction('sync_queue', 'readwrite');
          delTrans.objectStore('sync_queue').delete(item.id);
          continue;
        }
        
        const docRef = doc(fdb, collectionName, docId);

        if (item.action === 'save') {
          const dataToSync = { 
            ...item.data, 
            userId: user.uid, 
            shopId: user.shopId || null,
            updatedAt: serverTimestamp() 
          };
          await setDoc(docRef, dataToSync, { merge: true });
        } else if (item.action === 'delete') {
          await deleteDoc(docRef);
        }
        
        // Remove from queue
        await new Promise((res, rej) => {
          const delTrans = db.transaction('sync_queue', 'readwrite');
          const req = delTrans.objectStore('sync_queue').delete(item.id);
          req.onsuccess = res;
          req.onerror = rej;
        });
      } catch (e) {
        console.error(`[Sync] Failed item ${item.id}:`, e);
        
        const isTemp = isTemporaryError(e);
        const MAX_RETRIES = 5;

        if (isTemp) {
          item.retryCount = (item.retryCount || 0) + 1;
          
          if (item.retryCount >= MAX_RETRIES) {
            item.syncFailed = true;
            item.lastError = e.message || 'Max retries reached';
          }
          
          // Sačuvaj nazad u sync_queue (put) umjesto delete
          await new Promise((res) => {
            const updateTrans = db.transaction('sync_queue', 'readwrite');
            updateTrans.objectStore('sync_queue').put(item);
            updateTrans.oncomplete = res;
            updateTrans.onerror = res;
          });
        } else {
          // Sigurnosni fiks: Ako stavka zapne zbog permisija ili trajnih grešaka,
          // ukloni je iz reda nakon što uzrokuje grešku, kako ne bi blokirala odjavu.
          await new Promise((res) => {
            const delTrans = db.transaction('sync_queue', 'readwrite');
            delTrans.objectStore('sync_queue').delete(item.id);
            delTrans.oncomplete = res;
            delTrans.onerror = res;
          });
        }
      }
    }
  } catch (e) {
    console.error("[Sync] Batch sync failed:", e);
  } finally {
    isSyncing = false;
  }
}

export async function pullFromFirestore(user) {
  if (!user || !navigator.onLine) return;

  const stores = ['entries', 'appointments', 'services', 'clients'];
  const db = await initDB();

  // Provjeri sinkronizacijski red čekanja
  const queue = await new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('sync_queue', 'readonly');
      const request = transaction.objectStore('sync_queue').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (e) {
      console.warn("[Sync] sync_queue not found or error:", e);
      resolve([]);
    }
  });

  // Skup ID-ova koji su u redu čekanja (lokalne promjene koje još nisu sinkronizirane)
  const pendingIds = new Set(queue.map(item => (item.id || item.data?.id)?.toString()));

  for (const storeName of stores) {
    const q = user.role === 'owner' 
      ? query(collection(fdb, storeName), where("shopId", "==", user.shopId))
      : query(collection(fdb, storeName), where("userId", "==", user.uid));
    
    const querySnapshot = await getDocs(q);
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const docId = doc.id;
      
      // SAMO ako dokument nije u redu čekanja za sinkronizaciju, smijemo ga pregaziti
      if (!pendingIds.has(docId)) {
        store.put({ ...data, id: docId });
      } else {
        console.log(`[Sync] Skipping pull for ${storeName}:${docId} because it has pending local changes.`);
      }
    });
  }
}
