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
 * Poziva se jednom pri učitavanju app-a (samo ako je Paddle spreman).
 */
export function initPaddle() {
  if (!PADDLE_CLIENT_TOKEN) {
    console.info('[Checkout] Paddle nije konfiguriran — checkout je onemogućen.');
    return false;
  }

  // TODO (Faza 2): Uncomment nakon što Paddle bude spreman
  // Paddle.Initialize({
  //   token: PADDLE_CLIENT_TOKEN,
  //   environment: PADDLE_ENVIRONMENT,
  //   eventCallback: handlePaddleEvent,
  // });

  return true;
}

/**
 * Otvara Paddle checkout za odabrani plan.
 * 
 * @param {Object} userData - Firestore user dokument
 * @param {'basic'|'premium'} plan
 */
export async function openCheckout(userData, plan) {
  const priceId = getPaddlePriceId(userData, plan);

  if (!priceId || !PADDLE_CLIENT_TOKEN) {
    console.warn('[Checkout] Checkout nije dostupan — Paddle nije konfiguriran.');
    showCheckoutUnavailableMessage();
    return;
  }

  // TODO (Faza 2): Uncomment i prilagoditi
  // Paddle.Checkout.open({
  //   items: [{ priceId: priceId, quantity: 1 }],
  //   customer: {
  //     email: userData.email,
  //   },
  //   customData: {
  //     userId: userData.uid,
  //     plan: plan,
  //     tier: userData.tier,
  //   },
  //   successUrl: 'https://tvoja-domena.com/success',
  //   closeCallback: () => console.log('[Checkout] Zatvoren bez kupnje.'),
  // });
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