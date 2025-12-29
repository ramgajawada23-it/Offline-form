const CACHE_NAME = "offline-form-v2";

const FILES_TO_CACHE = [
    "/Offline-form/",
    "/Offline-form/index.html",
    "/Offline-form/form.js",
    "/Offline-form/offline-db.js",
    "/Offline-form/tailwind.css",
    "/Offline-form/background.jpeg"
];


self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
    );
    self.skipWaiting();
});


self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.map(key => key !== CACHE_NAME && caches.delete(key))
            )
        )
    );
    self.clients.claim();
});


self.addEventListener("fetch", event => {
    event.respondWith(
        fetch(event.request).catch(() =>
            caches.match(event.request).then(res => {
                return res || caches.match("/Offline-form/index.html");
            })
        )
    );
});

