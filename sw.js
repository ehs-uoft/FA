// Service Worker for First Aid Kit Locator
const CACHE_NAME = 'fa-locator-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/FA/geojson.geojson',
    'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js',
    'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css'
];

// Install event
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME).then(cache => {
                return cache.addAll(STATIC_ASSETS);
            }),
            self.skipWaiting()
        ])
    );
});

// Activate event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control of all pages immediately
            self.clients.claim()
        ])
    );
});

// Fetch event
self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin) && 
        !event.request.url.includes('mapbox.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(event.request)
                    .then(response => {
                        // Don't cache non-successful responses or non-GET requests
                        if (!response || response.status !== 200 || event.request.method !== 'GET') {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // Return cached index.html for navigation requests
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }
                        return null;
                    });
            })
    );
});

// Handle messages
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
