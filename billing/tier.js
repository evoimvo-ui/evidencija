export const TIERS = {
  A: {
    label: 'Tier A',
    currency: 'EUR',
    plans: {
      basic: {
        price: 2.49,
        priceLabel: '€2.49',
        period: 'month',
        paddlePriceId: 'pri_01kssgnms0p7frm3q5zvh1vebb',
      },
      premium: {
        price: 9.99,
        priceLabel: '€9.99',
        period: 'month',
        paddlePriceId: 'pri_01kssgx7q9kwkey14zgs3nn24f',
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
        period: 'month',
        paddlePriceId: 'pri_01kssgz8m701xnxzxxbgh4zdfx',
      },
      premium: {
        price: 19.99,
        priceLabel: '€19.99',
        period: 'month',
        paddlePriceId: 'pri_01kssh12eakgsxzs11nx8qmt5c',
      }
    }
  }
};

export function getTierData(tier) {
  return TIERS[tier] || TIERS.A;
}