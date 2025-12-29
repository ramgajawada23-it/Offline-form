const DB_NAME = "OfflineCandidateDB";
const STORE_NAME = "candidates";
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = e => {
      db = e.target.result;
      db.createObjectStore(STORE_NAME, { autoIncrement: true });
    };

    request.onsuccess = e => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = () => reject("IndexedDB error");
  });
}

async function saveOffline(data) {
  await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).add(data);
}

async function getOfflineData() {
  await openDB();
  return new Promise(resolve => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

async function clearOfflineData() {
  await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).clear();
}
