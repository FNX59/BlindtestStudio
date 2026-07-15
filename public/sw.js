// Service Worker de BlindTest Studio.
// Il rend l'interface principale disponible hors-ligne après une première visite.

const CACHE_NAME = "blindtest-studio-v1.0.8";

const FICHIERS_A_METTRE_EN_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./sw.js"
];

// Installation : on prépare le cache local avec les fichiers essentiels.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FICHIERS_A_METTRE_EN_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activation : on supprime les anciens caches pour éviter les conflits de version.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(nomsCaches => Promise.all(
        nomsCaches
          .filter(nomCache => nomCache !== CACHE_NAME)
          .map(nomCache => caches.delete(nomCache))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch : stratégie cache-first.
// Les appels LLM, YouTube et worker audio restent autorisés en réseau par exception.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const estRequeteExterne = url.origin !== self.location.origin;

  if (estRequeteExterne) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(reponseCache => {
        if (reponseCache) return reponseCache;
        return fetch(event.request).then(reponseReseau => {
          const copie = reponseReseau.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copie));
          return reponseReseau;
        });
      })
  );
});
