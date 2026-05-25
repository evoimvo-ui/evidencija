import { auth, db } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot,
  collection, 
  query, 
  where, 
  getDocs,
  addDoc,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { detectCountryAndTier } from './billing/country.js';

// ---------------------------------------------------------------------------
// Trial & ToS helpers
// ---------------------------------------------------------------------------

const TRIAL_DAYS = 30;

/**
 * Vraća true ako je trial period istekao.
 */
export function isTrialExpired(userData) {
  if (!userData) return false;
  // Lifetime i aktivna pretplata uvijek prolaze
  if (userData.subscriptionStatus === 'active') return false;
  if (userData.subscriptionStatus === 'lifetime') return false;

  const started = userData.trialStartedAt;
  if (!started) return false;

  const startMs = started.toMillis ? started.toMillis() : new Date(started).getTime();
  const expiresMs = startMs + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() > expiresMs;
}

/**
 * Vraća broj dana koji su ostali u trialu (0 ako je istekao).
 */
export function trialDaysLeft(userData) {
  if (!userData) return 0;
  if (userData.subscriptionStatus === 'active') return Infinity;
  if (userData.subscriptionStatus === 'lifetime') return Infinity;

  const started = userData.trialStartedAt;
  if (!started) return TRIAL_DAYS;

  const startMs = started.toMillis ? started.toMillis() : new Date(started).getTime();
  const expiresMs = startMs + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = expiresMs - Date.now();
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

/**
 * Vraća true ako je korisnik prihvatio ToS.
 */
export function hasTosAccepted(userData) {
  return !!(userData && userData.tosAcceptedAt);
}

/**
 * Sprema ToS prihvatanje u Firestore.
 */
export async function acceptTos(userId) {
  const userRef = doc(db, "users", userId);
  try {
    await updateDoc(userRef, {
      tosAcceptedAt: serverTimestamp(),
      tosVersion: "1.0"
    });
  } catch (e) {
    if (e.code === 'not-found') {
      // Ako dokument ne postoji (npr. stari korisnik bez doc-a), kreiraj ga
      await setDoc(userRef, {
        uid: userId,
        tosAcceptedAt: serverTimestamp(),
        tosVersion: "1.0"
      }, { merge: true });
    } else {
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Whitelist helper
// ---------------------------------------------------------------------------

/**
 * Provjerava da li je email na whitelist listi u Firestore config/whitelist.
 * Ako dokument ne postoji ili detekcija ne uspije, vraća false.
 */
async function isWhitelisted(email) {
  try {
    const whitelistDoc = await getDoc(doc(db, "config", "whitelist"));
    if (!whitelistDoc.exists()) return false;
    const emails = whitelistDoc.data().emails || [];
    return emails.includes(email.toLowerCase());
  } catch (e) {
    console.warn('[Auth] Whitelist provjera neuspješna:', e.message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auth core
// ---------------------------------------------------------------------------

export function initAuth(onLoggedIn, onLoggedOut) {
  let unsubscribeSnapshot = null;

  onAuthStateChanged(auth, async (user) => {
    // Ako imamo prethodni snapshot listener, ugasi ga
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }

    try {
      if (user) {
        const userRef = doc(db, "users", user.uid);
        
        // Postavi real-time listener na korisnički dokument
        unsubscribeSnapshot = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.data();
            console.log("[Auth] Real-time update primljen:", userData.subscriptionStatus);
            onLoggedIn(user, userData);
          } else {
            const fallbackData = { role: 'solo', uid: user.uid, name: user.displayName || 'Korisnik' };
            onLoggedIn(user, fallbackData);
          }
        }, (error) => {
          console.error("Firestore snapshot error:", error);
        });

      } else {
        onLoggedOut();
      }
    } catch (error) {
      console.error("Auth initialization error:", error);
      onLoggedOut();
    }
  });
}

export function hideAuthScreen() {
  const authScreen = document.getElementById('authScreen');
  const appContent = document.getElementById('appContent');
  if (authScreen) authScreen.style.display = 'none';
  if (appContent) appContent.style.display = 'block';
}

export function showAuthScreen() {
  const authScreen = document.getElementById('authScreen');
  const appContent = document.getElementById('appContent');
  if (authScreen) authScreen.style.display = 'flex';
  if (appContent) appContent.style.display = 'none';
}

export async function register(name, email, pass, role = 'solo') {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, pass);

    // Paralelno: detekcija tiera i whitelist provjera
    const [{ country, tier }, whitelisted] = await Promise.all([
      detectCountryAndTier(),
      isWhitelisted(email)
    ]);

    console.log(`[Auth] Whitelist: ${whitelisted}, country: ${country}, tier: ${tier}`);

    const userData = {
      uid: res.user.uid,
      name: name,
      email: email.toLowerCase(),
      role: role,
      shopId: null,
      invitedBy: null,
      createdAt: serverTimestamp(),
      // Trial & ToS
      trialStartedAt: serverTimestamp(),
      tosAcceptedAt: null,
      tosVersion: null,
      // Whitelist korisnici dobivaju lifetime status odmah
      subscriptionStatus: whitelisted ? 'lifetime' : 'trial',
      subscriptionPlan: whitelisted ? 'premium' : null,
      // Billing tier
      country: country,
      tier: tier,
      roleHistory: [{ 
        from: 'none', 
        to: role, 
        date: new Date().toISOString() 
      }]
    };

    await setDoc(doc(db, "users", res.user.uid), userData);
    await checkAndApplyInvites(res.user.uid, email.toLowerCase());

    return { user: res.user, userData };
  } catch (e) {
    console.error("Registration error:", e);
    throw e;
  }
}

async function checkAndApplyInvites(userId, email) {
  const invitesRef = collection(db, "invites");
  const q = query(invitesRef, where("email", "==", email), where("status", "==", "pending"));
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    const inviteDoc = querySnapshot.docs[0];
    const inviteData = inviteDoc.data();
    
    await updateDoc(doc(db, "users", userId), {
      shopId: inviteData.shopId,
      invitedBy: inviteData.ownerId,
      role: 'worker',
      roleHistory: arrayUnion({ 
        from: 'solo', 
        to: 'worker', 
        date: new Date().toISOString(),
        shopId: inviteData.shopId
      })
    });
    
    await updateDoc(inviteDoc.ref, {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
      workerId: userId
    });

    console.log(`Invite accepted for ${email}. User ${userId} joined shop ${inviteData.shopId}`);
  }
}

export async function login(email, pass) {
  try {
    const res = await signInWithEmailAndPassword(auth, email, pass);
    await checkAndApplyInvites(res.user.uid, email.toLowerCase());
    const userDoc = await getDoc(doc(db, "users", res.user.uid));
    return { user: res.user, userData: userDoc.data() };
  } catch (e) {
    console.error("Login error:", e);
    throw e;
  }
}

import { 
  saveData, 
  getAllData, 
  deleteData, 
  syncWithFirestore, 
  pullFromFirestore,
  clearLocalData
} from './db.js';

export async function logout() {
  const cleared = await clearLocalData();
  if (cleared) {
    await signOut(auth);
    location.reload(); 
  }
}

export async function createShop(userId, shopName) {
  const userRef = doc(db, "users", userId);
  let userSnap = await getDoc(userRef);
  let userData = userSnap.exists() ? userSnap.data() : null;
  
  if (!userData) {
    const user = auth.currentUser;
    userData = {
      uid: userId,
      name: user?.displayName || "Korisnik",
      email: user?.email || "nepoznato",
      role: 'solo',
      shopId: null,
      invitedBy: null,
      createdAt: serverTimestamp(),
      trialStartedAt: serverTimestamp(),
      tosAcceptedAt: null,
      tosVersion: null,
      subscriptionStatus: 'trial',
      subscriptionPlan: null,
      country: 'XX',
      tier: 'A',
    };
    await setDoc(userRef, userData);
  }

  if (!userData) throw new Error("Neuspješno učitavanje profila.");
  
  if (userData.invitedBy || userData.role === 'worker') {
    throw new Error("Ne možete postati vlasnik jer ste već dio druge radnje.");
  }

  const shopRef = await addDoc(collection(db, "shops"), {
    name: shopName,
    ownerId: userId,
    services: [],
    createdAt: serverTimestamp()
  });

  const shopId = shopRef.id;
  await transferSoloDataToShop(userId, shopId);

  await updateDoc(userRef, {
    role: 'owner',
    shopId: shopId,
    roleHistory: arrayUnion({ 
      from: userData.role, 
      to: 'owner', 
      date: new Date().toISOString() 
    })
  });

  return shopId;
}

async function transferSoloDataToShop(userId, shopId) {
  console.log(`[Auth] Transferring data for user ${userId} to shop ${shopId}`);
  try {
    const stores = ['entries', 'appointments', 'services'];
    for (const storeName of stores) {
      const q = query(collection(db, storeName), where("userId", "==", userId), where("shopId", "==", null));
      const snap = await getDocs(q);
      if (!snap.empty) {
        console.log(`[Auth] Found ${snap.size} solo items in ${storeName} to transfer.`);
        for (const docSnap of snap.docs) {
          await updateDoc(docSnap.ref, { shopId: shopId });
        }
      }
    }
  } catch (e) {
    console.error("[Auth] Data transfer failed:", e);
  }
}

export async function inviteWorker(ownerId, shopId, workerEmail) {
  const email = workerEmail.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw new Error("Neispravna email adresa.");

  const invitesRef = collection(db, "invites");
  const q = query(invitesRef, where("shopId", "==", shopId), where("email", "==", email), where("status", "==", "pending"));
  const existing = await getDocs(q);
  if (!existing.empty) throw new Error("Radnik je već pozvan.");

  await addDoc(collection(db, "invites"), {
    shopId: shopId,
    ownerId: ownerId,
    email: email,
    status: 'pending',
    createdAt: serverTimestamp()
  });
}