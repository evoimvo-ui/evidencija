import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js";

import { CONFIG } from './config.js';

const firebaseConfig = CONFIG.FIREBASE;

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

export async function requestNotificationPermission() {
  if (!messaging) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const token = await getToken(messaging, { vapidKey: 'BPJaCez1UnehEOO9pQNT5SlLBDY0ojnVIj51uAr2hZKjtMKE3u-6sonFVjd5-u7vHoliajeXyXcJE2SlGJPNEjU' });
      return token;
    }
  } catch (e) {
    console.error("Notification permission error:", e);
  }
}