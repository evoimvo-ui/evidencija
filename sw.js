const CACHE = 'evidencija-v13'; // Verzija v13 za prisilno osvježavanje
const FILES = [
  './', 
  './index.html', 
  './manifest.json',
  './firebase.js',
  './auth.js',
  './db.js',
  'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  './lang/bs.json', './lang/en.json', './lang/hr.json', './lang/sr.json', './lang/mk.json', 
  './lang/sl.json', './lang/bg.json', './lang/ro.json', './lang/hu.json', './lang/pl.json', 
  './lang/nl.json', './lang/el.json', './lang/it.json', './lang/da.json', './lang/sv.json', 
  './lang/no.json', './lang/fi.json', './lang/pt.json', './lang/de.json', './lang/fr.json', 
  './lang/es.json', './lang/tr.json', './lang/ru.json', './lang/zh.json', './lang/fa.json', 
  './lang/ur.json', './lang/ja.json', './lang/et.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Keširamo samo GET zahtjeve
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      // Ne keširamo dinamičke pozive ka Firebase bazi (firestore.googleapis.com)
      // jer to rješava sama Firebase biblioteka
      if (e.request.url.includes('firestore.googleapis.com')) return res;
      
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});