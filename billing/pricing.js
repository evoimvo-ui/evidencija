/**
 * billing/pricing.js
 * Helper funkcije za dohvat cijena na osnovu korisnikovog tier-a.
 * Koristi se u Upgrade ekranu i svugdje gdje se prikazuju cijene.
 */

import { getTierData } from './tier.js';

/**
 * Vraća podatke o cijeni za određenog korisnika i plan.
 * 
 * @param {Object} userData - Firestore user dokument (mora imati .tier polje)
 * @param {'basic'|'premium'} plan
 * @returns {{ price: number, priceLabel: string, period: string, paddlePriceId: string|null }}
 */
export function getPrice(userData, plan) {
  const tier = userData?.tier || 'A';
  const tierData = getTierData(tier);
  const planData = tierData.plans[plan];

  if (!planData) {
    console.warn(`[Pricing] Nepoznati plan: ${plan}`);
    return { price: 0, priceLabel: 'N/A', period: 'mj', paddlePriceId: null };
  }

  return { ...planData };
}

/**
 * Vraća priceLabel stringu direktno — korisno za template rendering.
 * Npr. getPriceLabel(userData, 'basic') → '€9.99'
 */
export function getPriceLabel(userData, plan) {
  return getPrice(userData, plan).priceLabel;
}

/**
 * Vraća Paddle Price ID za checkout.
 * Vraća null dok Paddle nije konfiguriran.
 */
export function getPaddlePriceId(userData, plan) {
  return getPrice(userData, plan).paddlePriceId;
}