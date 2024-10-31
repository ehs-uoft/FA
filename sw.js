// Service Worker for First Aid Kit Locator
const CACHE_NAME = 'fa-locator-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/FA/geojson.geojson',
    'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js',
    'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2'
];

// Cache duration in milliseconds (7 days)
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

// Install event
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME).then(cache => {
                return cache.addAll(STATIC_ASSETS);
            }),
            self.skipWaiting()
        ]).catch(error => {
            console.error('Service worker installation failed:', error);
        })
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
            // Clean up expired cached items
            cleanExpiredCache(),
            // Take control of all pages immediately
            self.clients.claim()
        ]).catch(error => {
            console.error('Service worker activation failed:', error);
        })
    );
});

// Fetch event
self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin) && 
        !event.request.url.includes('mapbox.com') && 
        !event.request.url.includes('cloudflare.com')) {
        return;
    }

    // Network-first strategy for API requests
    if (event.request.url.includes('/FA/geojson.geojson')) {
        event.respondWith(networkFirstStrategy(event.request));
        return;
    }

    // Cache-first strategy for static assets
    if (isStaticAsset(event.request.url)) {
        event.respondWith(cacheFirstStrategy(event.request));
        return;
    }

    // Cache-first with network fallback for everything else
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(event.request)
                    .then(response => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        // Clone the response
                        const responseToCache = response.clone();

                        // Cache the fetched response
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

// Message event
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Helper functions
async function networkFirstStrategy(request) {
    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

async function cacheFirstStrategy(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        console.error('Cache first strategy failed:', error);
        throw error;
    }
}

function isStaticAsset(url) {
    const staticExtensions = [
        '.js', '.css', '.woff2', '.svg', '.png', 
        '.jpg', '.jpeg', '.gif', '.ico'
    ];
    return staticExtensions.some(ext => url.endsWith(ext));
}

async function cleanExpiredCache() {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    const now = Date.now();

    return Promise.all(
        requests.map(async (request) => {
            const response = await cache.match(request);
            if (!response) return;

            const headers = response.headers;
            const date = headers.get('date');
            if (!date) return;

            const age = now - new Date(date).getTime();
            if (age > CACHE_DURATION) {
                return cache.delete(request);
            }
        })
    );
}

// Error handling
self.addEventListener('error', (error) => {
    console.error('Service worker error:', error);
});

self.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

// Periodic cache cleanup
setInterval(() => {
    cleanExpiredCache().catch(error => {
        console.error('Cache cleanup failed:', error);
    });
}, 24 * 60 * 60 * 1000); // Run once per day
