# Dokumentacija ispravki i promjena - Pustopoljina Aplikacija

## 1. Sustav zakazivanja termina (Update)

### Ispravci baze podataka i sinkronizacije
- **Problem**: Termini se nisu spremali pouzdano u bazu podataka (Firestore).
- **Uzrok**: `syncWithFirestore` u `db.js` nije ispravno čekao završetak asinkronih operacija, što je dovodilo do "race conditiona" i gubitka podataka u sinkronizacijskom redu (sync queue).
- **Rješenje**: Funkcija `syncWithFirestore` je prerađena da koristi `Promise` i `await` za svaki element u redu čekanja, osiguravajući da se svaki unos sinkronizira prije nego se obriše iz lokalnog reda.
- **Dodatno**: Poboljšan `saveData` u `db.js` sa eksplicitnim transakcijama i boljim loggingom.

### Validacija i povratne informacije
- **Problem**: Nedostatak povratnih informacija korisniku pri spremanju termina i zaleđivanje gumba.
- **Rješenje**: Dodana je validacija u `saveAppointment`. Gumb za spremanje sada pokazuje "Spremanje..." i onemogućen je dok proces ne završi. Dodani su robustni `try-catch` blokovi i `Toast` notifikacije.

### Bug u podsjetnicima (višestruki klikovi i ponavljanje)
- **Problem**: Slanje podsjetnika je zahtijevalo više klikova i isti podsjetnici su se stalno pojavljivali.
- **Rješenje**: Gumb za slanje se sada onemogućuje tijekom obrade. Implementiran je **Dismiss** mehanizam (`dismissedReminders`) koji pamti koje je podsjetnike korisnik odbio (sprema se u `localStorage` na 48h), čime se sprječava ponavljajuće iskakanje istih prozora.

### 24h Logika podsjetnika
- **Rješenje**: Logika je proširena tako da se podsjetnik aktivira bilo kada unutar 24 sata prije termina, pod uvjetom da već nije poslan ili eksplicitno odbijen od strane korisnika.

### Zaglavljivanje u prozoru za podsjetnik (Mobilna verzija)
- **Problem**: Gumbi nisu reagirali na mobitelima.
- **Rješenje**: 
    - Implementiran globalni `closeModal` mehanizam.
    - Dodana podrška za **Swipe Down** (prevlačenje prema dolje) za zatvaranje modala.
    - Implementiran **Back Button handling** (pritiskom na 'nazad' na mobitelu se zatvara modal umjesto izlaska iz aplikacije).
    - Dodana `Escape` tipka za desktop korisnike.

## 2. Lokalizacija i prijevodi

### Dinamičko učitavanje i Fallback
- **Poboljšanje**: Implementiran sustav koji prvo učitava engleski jezik kao osnovu (fallback), a zatim spaja (merge) izabrani jezik preko njega. Ovo osigurava da korisnik nikada ne vidi prazna polja ako neki ključ nedostaje u prijevodu.

## 3. Filter by Worker (Poboljšanja)
- **Problem**: Dropdown meni se nije otvarao ispravno i bilo je teško pronaći radnika.
- **Rješenje**:
    - Dropdown se sada puni direktno iz baze pri otvaranju ekrana termina (za vlasnike).
    - Dodana **Search (pretraga)** funkcionalnost unutar filtera za lakše pronalaženje radnika u velikim timovima.
    - Filteri su sada stilizirani i vidljiviji.

## 4. Error Logging i Monitoring
- **Novo**: Implementiran globalni `window.onerror` i `window.onunhandledrejection` handler koji sve kritične greške u aplikaciji automatski šalje u Firestore kolekciju `logs`. Ovo omogućava praćenje bugova u produkciji bez potrebe za korisničkim prijavama.

## 5. Deployment Checklist
- **Novo**: Kreirana datoteka `DEPLOYMENT_CHECKLIST.md` sa uputama za verifikaciju prije svakog deploymenta.
