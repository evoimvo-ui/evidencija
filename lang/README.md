# Upute za Upravljanje Prijevodima (Localization Management)

Ovaj direktorij (`lang/`) sadrži JSON datoteke s prijevodima za aplikaciju. Za održavanje konzistentnosti i sinkronizacije prijevoda koriste se dvije Node.js skripte: `sync_langs.js` i `final_sync_structure.js`.

---

## 1. `sync_langs.js`

-   **Svrha**: Ova skripta osigurava da sve jezične datoteke (`*.json`) sadrže sve ključeve prisutne u `en.json` (engleski jezik, koji služi kao referentni/fallback jezik). Ako ključ nedostaje u nekoj jezičnoj datoteci, bit će dodan s vrijednošću iz `en.json`. Također uklanja ključeve koji više ne postoje u `en.json`.
-   **Način rada**:
    1.  Učitava `en.json` kao referencu.
    2.  Učitava `bs.json` (bosanski jezik) i osigurava da sadrži sve ključeve iz `en.json`. `bs.json` se tretira kao primarni jezik za sinkronizaciju strukture ostalih jezika.
    3.  Prolazi kroz sve ostale `*.json` datoteke u `lang/` direktoriju (osim `en.json` i `bs.json`).
    4.  Za svaku datoteku:
        -   Dodaje nedostajuće ključeve iz `en.json`.
        -   Uklanja ključeve koji ne postoje u `en.json`.
        -   Sortira ključeve tako da odgovaraju redoslijedu u `en.json`.
-   **Kada pokrenuti**:
    -   **Nakon dodavanja novih stringova u `en.json`**: Osigurava da se novi ključevi automatski dodaju svim ostalim jezicima s engleskim vrijednostima kao privremenim rješenjem.
    -   **Nakon uklanjanja stringova iz `en.json`**: Čisti zastarjele ključeve iz ostalih jezičnih datoteka.
    -   **Periodično, za održavanje konzistentnosti.**
-   **Kako pokrenuti**: Pokrenite putem Node.js:
    ```bash
    node sync_langs.js
    ```

---

## 2. `final_sync_structure.js`

-   **Svrha**: Ova skripta osigurava da sve jezične datoteke (osim `en.json`) imaju istu strukturu ključeva i redoslijed kao `bs.json`. `bs.json` se ovdje koristi kao primarna referenca za strukturu prijevoda.
-   **Način rada**:
    1.  Učitava `bs.json` kao referentnu strukturu ključeva.
    2.  Prolazi kroz sve ostale `*.json` datoteke u `lang/` direktoriju (osim `en.json` i `bs.json`).
    3.  Za svaku datoteku:
        -   Dodaje nedostajuće ključeve iz `bs.json`.
        -   Uklanja ključeve koji ne postoje u `bs.json`.
        -   Sortira ključeve tako da odgovaraju redoslijedu u `bs.json`.
-   **Kada pokrenuti**:
    -   **Nakon promjena u `bs.json` (npr. dodavanje ili uklanjanje ključeva ručno)**: Osigurava da sve ostale jezične datoteke prate istu strukturu.
    -   **Prije finalnog deploymenta**: Kao provjera da su svi prijevodi konzistentni.
-   **Kako pokrenuti**: Pokrenite putem Node.js:
    ```bash
    node final_sync_structure.js
    ```

---

## Preporučeni tijek rada (Workflow)

1.  Uvijek dodajte/izmijenite nove prijevode u `en.json`.
2.  Pokrenite `node sync_langs.js` kako biste proširili nove ključeve na sve jezike.
3.  Prevedite nove ključeve u `bs.json` i ostalim jezičnim datotekama.
4.  Ako ste izravno mijenjali `bs.json`, pokrenite `node final_sync_structure.js` kako biste osigurali da se ta struktura prenese na ostale jezike.

Ove skripte se trebaju pokretati u Node.js okruženju, idealno kao dio pre-commit hooka ili kao korak u vašem CI/CD pipelineu.
