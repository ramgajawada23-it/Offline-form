const CACHE_NAME = "offline-form-v7";

const FILES = [
  "./",
  "./login.html",
  "./index.html",
  "./styles.css",
  "./login.js",
  "./form.js",
  "./offline-db.js",
  "./signature.png",
  "./BG1.jpg",
  "./BG2.jpg",
  "./BG3.jpg",
  "./BG4.1.jpg",
  "./logo.png",
  "./sideimg.jpg",
  "./sideimg1.jpg"
];

/* ================= INSTALL ================= */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES))
      .catch(err => console.error("Cache install failed", err))
  );
  self.skipWaiting();
});

/* ================= ACTIVATE ================= */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(k => k !== CACHE_NAME && caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ================= FETCH ================= */
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // 🚫 Never cache API calls
  if (url.pathname.startsWith("/api")) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(res => res || fetch(event.request))
      .catch(() => caches.match("./index.html"))
  );
});

/* ================= BACKGROUND SYNC ================= */
self.addEventListener("sync", event => {
  if (event.tag === "sync-offline-forms") {
    event.waitUntil(syncForms());
  }
});

async function syncForms() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("candidateDB", 1);

    req.onerror = reject;

    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("submissions", "readwrite");
      const store = tx.objectStore("submissions");
      const pending = [];

      store.openCursor().onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          pending.push({ ...cursor.value, id: cursor.key });
          cursor.continue();
        } else {
          (async () => {
            for (const record of pending) {
              try {
                const response = await fetch("https://offlineform.onrender.com/api/candidates", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(record)
                });

                if (response.ok) {
                  // Open a new transaction for deletion to avoid closure issues
                  const deleteTx = db.transaction("submissions", "readwrite");
                  deleteTx.objectStore("submissions").delete(record.id);
                }
              } catch (e) {
                console.error("SW Sync failed for record", e);
              }
            }
            resolve();
          })();
        }
      };
    };
  });
}