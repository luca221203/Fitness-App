// IndexedDB-Wrapper nach dem Datenmodell aus dem Konzept-Dokument.
// Stores: profile, bodyMeasurements, mealLog, trainingSessions, setLog.

const DB_NAME = "ef-app-db";
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("profile")) {
        db.createObjectStore("profile", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("bodyMeasurements")) {
        const store = db.createObjectStore("bodyMeasurements", { keyPath: "id", autoIncrement: true });
        store.createIndex("byDate", "date");
      }
      if (!db.objectStoreNames.contains("mealLog")) {
        const store = db.createObjectStore("mealLog", { keyPath: "id", autoIncrement: true });
        store.createIndex("byDate", "date");
      }
      if (!db.objectStoreNames.contains("trainingSessions")) {
        const store = db.createObjectStore("trainingSessions", { keyPath: "id", autoIncrement: true });
        store.createIndex("byDate", "date");
      }
      if (!db.objectStoreNames.contains("setLog")) {
        const store = db.createObjectStore("setLog", { keyPath: "id", autoIncrement: true });
        store.createIndex("bySession", "sessionId");
      }
    };

    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror = (event) => reject(event.target.error);
  });
  return dbPromise;
}

async function tx(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = fn(store);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = (event) => reject(event.target.error);
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const DB = {
  async getProfile() {
    const db = await openDb();
    const store = db.transaction("profile", "readonly").objectStore("profile");
    return reqToPromise(store.get("profile"));
  },
  async saveProfile(profile) {
    const db = await openDb();
    const store = db.transaction("profile", "readwrite").objectStore("profile");
    return reqToPromise(store.put({ id: "profile", ...profile }));
  },
  async addBodyMeasurement(entry) {
    const db = await openDb();
    const store = db.transaction("bodyMeasurements", "readwrite").objectStore("bodyMeasurements");
    return reqToPromise(store.add(entry));
  },
  async allBodyMeasurements() {
    const db = await openDb();
    const store = db.transaction("bodyMeasurements", "readonly").objectStore("bodyMeasurements");
    return reqToPromise(store.getAll());
  },
  async addMealLog(entry) {
    const db = await openDb();
    const store = db.transaction("mealLog", "readwrite").objectStore("mealLog");
    return reqToPromise(store.add(entry));
  },
  async mealLogByDate(date) {
    const all = await this.allMealLog();
    return all.filter((m) => m.date === date);
  },
  async allMealLog() {
    const db = await openDb();
    const store = db.transaction("mealLog", "readonly").objectStore("mealLog");
    return reqToPromise(store.getAll());
  },
  async updateMealLog(id, patch) {
    const db = await openDb();
    const getStore = db.transaction("mealLog", "readonly").objectStore("mealLog");
    const existing = await reqToPromise(getStore.get(id));
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    const putStore = db.transaction("mealLog", "readwrite").objectStore("mealLog");
    await reqToPromise(putStore.put(updated));
    return updated;
  },
  async addTrainingSession(entry) {
    const db = await openDb();
    const store = db.transaction("trainingSessions", "readwrite").objectStore("trainingSessions");
    return reqToPromise(store.add(entry));
  },
  async allTrainingSessions() {
    const db = await openDb();
    const store = db.transaction("trainingSessions", "readonly").objectStore("trainingSessions");
    return reqToPromise(store.getAll());
  },
  async addSetLog(entry) {
    const db = await openDb();
    const store = db.transaction("setLog", "readwrite").objectStore("setLog");
    return reqToPromise(store.add(entry));
  },
  async setLogBySession(sessionId) {
    const db = await openDb();
    const store = db.transaction("setLog", "readonly").objectStore("setLog");
    const index = store.index("bySession");
    return reqToPromise(index.getAll(sessionId));
  },
  async allSetLog() {
    const db = await openDb();
    const store = db.transaction("setLog", "readonly").objectStore("setLog");
    return reqToPromise(store.getAll());
  },
};

window.DB = DB;
