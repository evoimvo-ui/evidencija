/**
 * billing/checkout.js
 * Paddle Billing checkout integracija.
 * 
 * TRENUTNI STATUS: Disabled — čeka Paddle KYC verifikaciju i Price IDs.
 * U Fazi 2 zamijeniti TODO sekcije pravim Paddle konfiguracijama.
 */

import { getPaddlePriceId } from './pricing.js';
import { CONFIG } from '../config.js';

// TODO (Faza 2): Zamijeniti s pravim Paddle client-side token-om nakon KYC-a
const PADDLE_CLIENT_TOKEN = CONFIG.PADDLE.clientToken;
const PADDLE_ENVIRONMENT = CONFIG.PADDLE.environment;

/**
 * Inicijalizira Paddle SDK.
 * Poziva se jednom pri učitavanju app-a.
 */
export function initPaddle() {
  console.log('[Checkout] Inicijalizacija Paddle-a pozvana...');
  if (!PADDLE_CLIENT_TOKEN) {
    console.info('[Checkout] Paddle nije konfiguriran — checkout je onemogućen.');
    return false;
  }

  if (typeof Paddle === 'undefined') {
    console.warn('[Checkout] Paddle SDK nije učitan.');
    return false;
  }

  // Ispravan redoslijed za Paddle Billing v2 sandbox
  if (PADDLE_ENVIRONMENT === 'sandbox') {
    Paddle.Environment.set("sandbox");
  }

  Paddle.Initialize({
    token: PADDLE_CLIENT_TOKEN
  });

  console.log(`[Checkout] Paddle inicijaliziran u ${PADDLE_ENVIRONMENT} modu.`);
  return true;
}

/**
 * Otvara Paddle checkout za odabrani plan.
 * 
 * @param {Object} userData - Firestore user dokument
 * @param {'basic'|'premium'} plan
 */
export async function openCheckout(userData, plan) {
  // Debug log podataka prije otvaranja
  console.log('[Checkout] Pokušaj otvaranja checkouta:', {
    plan: plan,
    userId: userData?.uid || userData?.id,
    email: userData?.email,
    tier: userData?.tier || 'A'
  });

  const priceId = getPaddlePriceId(userData, plan);

  if (!priceId) {
    console.error(`[Checkout] Price ID nije pronađen za plan: ${plan}, tier: ${userData?.tier || 'A'}`);
    alert('Greška: Price ID nije pronađen.');
    return;
  }

  if (!PADDLE_CLIENT_TOKEN) {
    console.warn('[Checkout] Checkout nije dostupan — Client Token nije konfiguriran.');
    showCheckoutUnavailableMessage();
    return;
  }

  if (typeof Paddle === 'undefined' || !Paddle.Checkout) {
    alert('Paddle SDK nije spreman. Molimo osvježite stranicu.');
    return;
  }

  const checkoutOptions = {
    items: [{ 
      priceId: priceId, 
      quantity: 1 
    }],
    customData: {
      userId: userData?.uid || userData?.id,
      plan: plan,
      tier: userData?.tier || 'A',
    },
    settings: {
      displayMode: 'overlay',
      theme: 'light',
      locale: 'en'
    }
  };

  console.log('[Checkout] Šaljem parametre u Paddle.Checkout.open():', checkoutOptions);
  console.log("[Billing] USPJEH: Pokrećem Paddle checkout sa Price ID-jem:", priceId);

  try {
    Paddle.Checkout.open(checkoutOptions);
  } catch (err) {
    console.error('[Checkout] Greška pri pozivu Paddle.Checkout.open():', err);
    alert('Došlo je do greške pri otvaranju prozora za plaćanje.');
  }
}

/**
 * Prikazuje poruku da checkout još nije dostupan.
 * Koristi se kao fallback dok Paddle nije konfiguriran.
 */
function showCheckoutUnavailableMessage() {
  // Pokušaj naći upgrade modal / container unutar app-a
  const msg = document.getElementById('checkoutUnavailableMsg');
  if (msg) {
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 4000);
  } else {
    alert('Pretplata još nije dostupna. Uskoro!');
  }
}

/**
 * Paddle event callback — za praćenje webhook događaja na klijentskoj strani.
 * Stvarna obrada pretplate se radi u Cloud Function webhook handleru.
 */
function handlePaddleEvent(event) {
  console.log('[Checkout] Paddle event:', event.name, event.data);

  // TODO (Faza 2): Ovisno o eventu, možeš osvježiti UI
  // switch (event.name) {
  //   case 'checkout.completed':
  //     // Osvježi korisnikov userData iz Firestore
  //     break;
  // }
}