// A tiny string key/value store backed by IndexedDB, used to keep large data-URL
// blobs (imported material images, exported history images) OUT of the synchronous
// Taro storage (which has a small quota). IndexedDB only exists on H5; on the native
// (weapp/Dimina) runtime canUse() is false and callers fall back to inline storage.
//
// This replaces two byte-identical copies previously inlined in index.vue
// (user-assets + export-history). Behavior is preserved exactly: unavailable →
// put() resolves false, get() resolves '', del() resolves undefined.

export interface KvStore {
  canUse(): boolean
  put(id: string, value: string): Promise<boolean>
  get(id: string): Promise<string>
  del(id: string): Promise<void>
}

export function createKvStore(dbName: string, storeName: string): KvStore {
  const canUse = () => process.env.TARO_ENV === 'h5' && typeof indexedDB !== 'undefined'

  function open(): Promise<IDBDatabase | undefined> {
    if (!canUse()) return Promise.resolve(undefined)
    return new Promise((resolve) => {
      const req = indexedDB.open(dbName, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(undefined)
    })
  }

  return {
    canUse,
    async put(id, value) {
      const db = await open()
      if (!db) return false
      return new Promise<boolean>((resolve) => {
        const tx = db.transaction(storeName, 'readwrite')
        tx.objectStore(storeName).put(value, id)
        tx.oncomplete = () => { db.close(); resolve(true) }
        tx.onerror = () => { db.close(); resolve(false) }
      })
    },
    async get(id) {
      const db = await open()
      if (!db) return ''
      return new Promise<string>((resolve) => {
        const tx = db.transaction(storeName, 'readonly')
        const req = tx.objectStore(storeName).get(id)
        req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : '')
        req.onerror = () => resolve('')
        tx.oncomplete = () => db.close()
        tx.onerror = () => db.close()
      })
    },
    async del(id) {
      const db = await open()
      if (!db) return
      await new Promise<void>((resolve) => {
        const tx = db.transaction(storeName, 'readwrite')
        tx.objectStore(storeName).delete(id)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); resolve() }
      })
    },
  }
}
