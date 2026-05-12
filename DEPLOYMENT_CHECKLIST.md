# Deployment Checklist - Pustopoljina Aplikacija

Prije svakog pusha na Netlify, prođite kroz sljedeće korake kako biste osigurali stabilnost:

### 1. Lokalna verifikacija
- [ ] Pokrenite `runAppTests()` u konzoli preglednika (iz `tests.js`).
- [ ] Provjerite da li se novi termini spremaju i jesu li vidljivi u listi.
- [ ] Provjerite da li se modali zatvaraju na `Escape` tipku i swipe down (na mobilnom emulatoru).
- [ ] Provjerite rad filtera za radnike i pretragu unutar filtera.

### 2. Baza podataka i Sinkronizacija
- [ ] Provjerite konzolu za bilo kakve `[DB]` ili `[Sync]` greške.
- [ ] Ugasite internet (Offline mode) i provjerite da li se podaci spremaju u IndexedDB, a zatim sinkroniziraju kada se internet vrati.

### 3. Lokalizacija
- [ ] Promijenite jezik na barem 3 različita jezika (npr. HR, EN, ZH).
- [ ] Provjerite da li su svi elementi (uloge, gumbi, naslovi) ispravno prevedeni.
- [ ] Provjerite da li se koristi fallback na engleski za nedostajuće ključeve.

### 4. Sigurnost i Logging
- [ ] Provjerite Firestore `logs` kolekciju za bilo kakve kritične greške prijavljene od strane korisnika.
- [ ] Osigurajte da su osjetljivi podaci (telefon, klijent) kriptirani u bazi (provjerite Firestore dashboard).

### 5. Deployment
- [ ] Pushajte promjene na GitHub/GitLab granu koja je povezana s Netlify-em.
- [ ] Pratite Netlify build logove za eventualne greške pri buildu.
- [ ] Nakon deploymenta, testirajte produkcijsku verziju na mobilnom uređaju.
