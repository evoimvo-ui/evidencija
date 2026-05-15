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
  // U idealnom slučaju, ovo bi trebao biti derivat korisničke lozinke ili 
  // jedinstveni ključ koji se dohvaća nakon autentifikacije.
  ENCRYPTION_KEY: 'evidencija-secret-key',
  
  // Paddle Billing (ako se koristi)
  PADDLE: {
    clientToken: null,
    environment: 'sandbox'
  }
};
