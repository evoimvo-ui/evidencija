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
        paddlePriceId: null, // TODO: zamijeniti nakon Paddle KYC-a
      },
      premium: {
        price: 9.99,
        priceLabel: '€9.99',
        period: 'mj',
        paddlePriceId: null, // TODO
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
        paddlePriceId: null, // TODO
      },
      premium: {
        price: 19.99,
        priceLabel: '€19.99',
        period: 'mj',
        paddlePriceId: null, // TODO
      }
    }
  }
};

/**
 * Vraća tier objekt za korisnika.
 * @param {string} tier - 'A' ili 'B', default 'A'
 */
export function getTierData(tier) {
  return TIERS[tier] || TIERS['A'];
}