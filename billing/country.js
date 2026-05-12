/**
 * billing/country.js
 * Detekcija zemlje korisnika putem ipapi.co
 * Poziva se jednom na registraciji, rezultat se sprema u Firestore.
 */

const IPAPI_URL = 'https://ipapi.co/json/';
const DETECTION_TIMEOUT_MS = 5000;

/**
 * Dohvata country code korisnika.
 * Returns: { country: 'BA', tier: 'A' } ili fallback { country: 'XX', tier: 'A' }
 */
export async function detectCountryAndTier() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DETECTION_TIMEOUT_MS);

    const response = await fetch(IPAPI_URL, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`ipapi status: ${response.status}`);

    const data = await response.json();
    const country = data.country_code || 'XX';
    const tier = getTierForCountry(country);

    console.log(`[Billing] Detected country: ${country}, tier: ${tier}`);
    return { country, tier };

  } catch (e) {
    console.warn('[Billing] Country detection failed, using fallback (Tier A):', e.message);
    return { country: 'XX', tier: 'A' };
  }
}

/**
 * Određuje tier na osnovu country code-a.
 * Tier B = visoki prihodi, Tier A = sve ostalo (default).
 */
export function getTierForCountry(countryCode) {
  const TIER_B_COUNTRIES = new Set([
    'US', 'CA', 'GB', 'IE', 'IS', 'NO', 'SE', 'FI', 'DK',
    'NL', 'BE', 'LU', 'DE', 'AT', 'CH', 'FR', 'IT', 'ES',
    'PT', 'AU', 'NZ', 'JP', 'KR', 'SG', 'IL', 'AE', 'QA',
    'KW', 'SA'
  ]);

  return TIER_B_COUNTRIES.has(countryCode) ? 'B' : 'A';
}