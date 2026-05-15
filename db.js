import { CONFIG } from './config.js';

// Utility for robust encryption using Web Crypto API
const ENCRYPTION_KEY = CONFIG.ENCRYPTION_KEY;
const SALT = 'evidencija-fixed-salt-2026'; // In production, this could be user-specific

async function getEncryptionKey() {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(ENCRYPTION_KEY),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(SALT),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
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
    
    return btoa(String.fromCharCode.apply(null, combined));
  } catch (e) {
    console.error("Encryption error:", e);
    return text;
  }
}

async function decrypt(encoded) {
  if (!encoded) return encoded;
  try {
    const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    if (combined.length < 13) throw new Error("Invalid cipher text");
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const key = await getEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    // Fallback to legacy XOR for existing data
    return legacyDecrypt(encoded);
  }
}

function legacyDecrypt(encoded) {
  if (!encoded) return encoded;
  try {
    const text = atob(encoded);
    const decrypted = text.split('').map((char, i) => 
      String.fromCharCode(char.charCodeAt(0) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length))
    ).join('');
    return decodeURIComponent(escape(decrypted));
  } catch (e) {
    return encoded;
  }
}

// IndexedDB Wrapper
const DB_NAME = 'EvidencijaDB';
const DB_VERSION = 1;

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
      if (!db.objectStoreNames.contains('sync_queue')) {
        db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

export async function saveData(storeName, data) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName, 'sync_queue'], 'readwrite');
      const store = transaction.objectStore(storeName);
      const queue = transaction.objectStore('sync_queue');
      
      const processedData = { ...data };
      if (processedData.debtor) processedData.debtor = await encrypt(processedData.debtor);
      if (processedData.telefon) processedData.telefon = await encrypt(processedData.telefon);
      if (processedData.klijent) processedData.klijent = await encrypt(processedData.klijent);

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

export async function getAllData(storeName) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = async () => {
      const results = await Promise.all(request.result.map(async item => {
        const decrypted = { ...item };
        if (decrypted.debtor) decrypted.debtor = await decrypt(decrypted.debtor);
        if (decrypted.telefon) decrypted.telefon = await decrypt(decrypted.telefon);
        if (decrypted.klijent) decrypted.klijent = await decrypt(decrypted.klijent);
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
      try {
        const collectionName = item.store;
        const docId = (item.id || (item.data && item.data.id))?.toString();
        if (!docId) {
          console.warn("[Sync] Item missing ID, skipping:", item);
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
        const delTrans = db.transaction('sync_queue', 'readwrite');
        await new Promise((res, rej) => {
          const req = delTrans.objectStore('sync_queue').delete(item.id);
          req.onsuccess = res;
          req.onerror = rej;
        });
      } catch (e) {
        console.error(`[Sync] Failed item ${item.id}:`, e);
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

  const stores = ['entries', 'appointments', 'services'];
  const db = await initDB();

  for (const storeName of stores) {
    const q = user.role === 'owner' 
      ? query(collection(fdb, storeName), where("shopId", "==", user.shopId))
      : query(collection(fdb, storeName), where("userId", "==", user.uid));
    
    const querySnapshot = await getDocs(q);
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Ensure local ID matches Firestore ID
      store.put({ ...data, id: doc.id });
    });
  }
}
