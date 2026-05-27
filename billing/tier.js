/**
 * billing/tier.js
 * Tier definicije i cijene po planu.
 * Ovo je jedini izvor istine za cijene — Paddle Price IDs se dodaju ovdje.
 */

export const TIERS = {
  A: {
    label: 'Tier A',
    currency: 'EUR',
    plans: {
      basic: {
        price: 2.49,
        priceLabel: '€2.49',
        period: 'mj',
        paddlePriceId: 'pri_01ksg6w7ffr8syaaewns4xghdp',
      },
      premium: {
        price: 9.99,
        priceLabel: '€9.99',
        period: 'mj',
        paddlePriceId: 'pri_01ksg73dctd8dzbz0bcqy4my9s',
      }
    }
  },
  B: {
    label: 'Tier B',
    currency: 'EUR',
    plans: {
      basic: {
        price: 4.99,
        priceLabel: '€4.99',
        period: 'mj',
        paddlePriceId: 'pri_01ksg6w7ffr8syaaewns4xghdp', // Koristimo Tier A ID dok B ne bude spreman
      },
      premium: {
        price: 19.99,
        priceLabel: '€19.99',
        period: 'mj',
        paddlePriceId: 'pri_01ksg73dctd8dzbz0bcqy4my9s', // Koristimo Tier A ID dok B ne bude spreman
      }
    }
  }
};

/**
 * Vraća tier objekt za korisnika.
 * @param {string} tier - 'A' ili 'B', default 'A'
 */
export function getTierData(tier) {
  return TIERS[tier] || TIERS.A; 
}