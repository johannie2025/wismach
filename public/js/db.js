/**
 * WiseProjection — Base de données locale (IndexedDB natif)
 * Wise Design © 2025
 * Stockage : Bibles, Chants, Annonces, Playlists, Paramètres
 */
'use strict';

const DB = (() => {
  const DB_NAME = 'wiseprojection';
  const DB_VER  = 1;
  let _db = null;

  async function open() {
    if (_db) return _db;
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('verses'))    db.createObjectStore('verses',    { keyPath: 'id' });
        if (!db.objectStoreNames.contains('songs'))     db.createObjectStore('songs',     { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('announces')) db.createObjectStore('announces', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id', autoIncrement: true });
        if (!db.objectStoreNames.contains('settings'))  db.createObjectStore('settings',  { keyPath: 'key' });
        if (!db.objectStoreNames.contains('bibles'))    db.createObjectStore('bibles',    { keyPath: 'code' });
      };
      req.onsuccess = e => { _db = e.target.result; res(_db); };
      req.onerror   = () => rej(req.error);
    });
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((res, rej) => {
      const t  = db.transaction(store, mode);
      const os = t.objectStore(store);
      const req = fn(os);
      if (req) {
        req.onsuccess = () => res(req.result);
        req.onerror   = () => rej(req.error);
      } else {
        t.oncomplete = () => res();
        t.onerror    = () => rej(t.error);
      }
    });
  }

  async function getAll(store) {
    const db = await open();
    return new Promise((res, rej) => {
      const t  = db.transaction(store, 'readonly');
      const req = t.objectStore(store).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  async function put(store, val)    { return tx(store, 'readwrite', os => os.put(val)); }
  async function del(store, key)    { return tx(store, 'readwrite', os => os.delete(key)); }
  async function get(store, key) {
    const db = await open();
    return new Promise((res, rej) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
  }

  async function getSetting(key, def = null) {
    const r = await get('settings', key);
    return r ? r.value : def;
  }
  async function setSetting(key, value) { return put('settings', { key, value }); }

  return { open, put, del, get, getAll, getSetting, setSetting };
})();
