/**
 * Centralna konfiguracija za aplikaciju.
 * NAPOMENA: U produkciji, osjetljive ključeve bi trebalo dohvatiti preko 
 * sigurnih environment varijabli tijekom build procesa.
 */

export const CONFIG = {
  // Firebase konfiguracija (javno dostupna u klijentskom kodu)
  FIREBASE: {
    apiKey: "AIzaSyCUfEycMs0Ku46Pa9M9UQfrXGhjWy6aCtQ",
    authDomain: "evidencija-app-abc64.firebaseapp.com",
    projectId: "evidencija-app-abc64",
    storageBucket: "evidencija-app-abc64.firebasestorage.app",
    messagingSenderId: "1093805618917",
    appId: "1:1093805618917:web:9d25edaeec85bbcd6b860c"
  },
  
  // Ključ za lokalnu enkripciju podataka u IndexedDB
  ENCRYPTION_KEY: 'pustopoljina-evidencija-v2', 
  OLD_ENCRYPTION_KEY: 'evidencija-ex-key-2024', 
  
  // Paddle Billing (ako se koristi)
  PADDLE: {
    clientToken: 'live_95d15422747d16b776686d8c6bc',
    environment: 'production'
  }
};
