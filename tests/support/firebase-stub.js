(function () {
  // Firestore 스텁 저장소: 같은 테스트 컨텍스트 내에서 page.reload() 를 넘어 유지되도록
  // sessionStorage 에 write-through 한다. (Playwright 는 테스트마다 컨텍스트가 격리되므로 누수 없음)
  const SS_KEY = '__fb_stub_store__';
  const readSS = () => { try { return JSON.parse(sessionStorage.getItem(SS_KEY)) || {}; } catch (e) { return {}; } };
  const store = readSS();       // { "users/u1": {...}, "users/u1/trips/t1": {...} }
  const persist = () => { try { sessionStorage.setItem(SS_KEY, JSON.stringify(store)); } catch (e) {} };
  let authUser = null, authCb = null, offline = false, pendingUser = null;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const stamp = () => ({ __ts: Date.now() });
  const rid = () => 'auto_' + Math.random().toString(36).slice(2, 9);

  const DELETE_SENTINEL = { __fbDelete: true };
  const isArrayUnion = (v) => v && v.__fbArrayUnion;
  const isArrayRemove = (v) => v && v.__fbArrayRemove;
  const isDelete = (v) => v === DELETE_SENTINEL;

  function setDeep(obj, dotPath, value) {
    const parts = dotPath.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = parts[i];
      if (typeof cur[k] !== 'object' || cur[k] === null || Array.isArray(cur[k])) cur[k] = {};
      cur = cur[k];
    }
    const lastKey = parts[parts.length - 1];
    if (isDelete(value)) {
      delete cur[lastKey];
    } else if (isArrayUnion(value)) {
      const arr = Array.isArray(cur[lastKey]) ? cur[lastKey].slice() : [];
      value.__fbArrayUnion.forEach(item => { if (!arr.includes(item)) arr.push(item); });
      cur[lastKey] = arr;
    } else if (isArrayRemove(value)) {
      const arr = Array.isArray(cur[lastKey]) ? cur[lastKey].slice() : [];
      cur[lastKey] = arr.filter(item => !value.__fbArrayRemove.includes(item));
    } else {
      cur[lastKey] = clone(value);
    }
  }

  const listeners = {}; // { [path]: Set<cb> }
  function notify(path) {
    const set = listeners[path];
    if (!set || !set.size) return;
    const data = store[path];
    const snap = { exists: !!data, id: path.split('/').pop(), data: () => clone(data) };
    set.forEach(cb => cb(snap));
  }

  function docRef(path) {
    return {
      path,
      async get() {
        if (offline) throw new Error('offline');
        const d = store[path];
        const snapshot = clone(d);
        return { exists: !!d, id: path.split('/').pop(), data: () => snapshot };
      },
      async set(v, opts) {
        if (offline) throw new Error('offline');
        store[path] = opts && opts.merge ? Object.assign({}, store[path] || {}, clone(v)) : clone(v);
        persist();
        notify(path);
      },
      async update(v) {
        if (offline) throw new Error('offline');
        const target = store[path] || (store[path] = {});
        Object.keys(v).forEach(dotPath => setDeep(target, dotPath, v[dotPath]));
        persist();
        notify(path);
      },
      async delete() {
        if (offline) throw new Error('offline');
        delete store[path];
        persist();
        notify(path);
      },
      onSnapshot(cb) {
        if (!listeners[path]) listeners[path] = new Set();
        listeners[path].add(cb);
        Promise.resolve().then(() => {
          const d = store[path];
          cb({ exists: !!d, id: path.split('/').pop(), data: () => clone(d) });
        });
        return () => { if (listeners[path]) listeners[path].delete(cb); };
      },
      collection(sub) { return collRef(path + '/' + sub); },
    };
  }
  function collRef(path) {
    return {
      path,
      doc(id) { return docRef(path + '/' + (id || rid())); },
      async add(v) {
        if (offline) throw new Error('offline');
        const p = path + '/' + rid();
        store[p] = clone(v);
        persist();
        return docRef(p);
      },
      async get() {
        const prefix = path + '/';
        const docs = Object.keys(store)
          .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
          .map((k) => ({ id: k.slice(prefix.length), data: () => clone(store[k]), ref: docRef(k) }));
        return { docs, empty: docs.length === 0, forEach: (f) => docs.forEach(f) };
      },
    };
  }
  const fakeAuth = {
    onAuthStateChanged(cb) { authCb = cb; Promise.resolve().then(() => cb(authUser)); return () => {}; },
    async signInWithPopup() {
      authUser = pendingUser || { uid: 'u1', displayName: '김진', email: 'emalration2@gmail.com', photoURL: '' };
      if (authCb) authCb(authUser);
      return { user: authUser };
    },
    async signOut() { authUser = null; if (authCb) authCb(null); },
  };
  const fakeDb = { collection: (p) => collRef(p), doc: (p) => docRef(p) };
  window.firebase = { initializeApp() {}, auth: () => fakeAuth, firestore: () => fakeDb };
  window.firebase.auth.GoogleAuthProvider = function () {};
  window.firebase.firestore.FieldValue = {
    serverTimestamp: stamp,
    delete: () => DELETE_SENTINEL,
    arrayUnion: (...items) => ({ __fbArrayUnion: items }),
    arrayRemove: (...items) => ({ __fbArrayRemove: items }),
  };

  window.__test = {
    signIn(user) { pendingUser = user || null; return fakeAuth.signInWithPopup(); },
    signOut() { return fakeAuth.signOut(); },
    setOffline(v) { offline = !!v; },
    seed(path, obj) { store[path] = clone(obj); persist(); },
    dump() { return clone(store); },
    reset() { Object.keys(store).forEach((k) => delete store[k]); persist(); authUser = null; offline = false; pendingUser = null; },
  };
})();
