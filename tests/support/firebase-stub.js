(function () {
  const store = {};              // { "users/u1": {...}, "users/u1/trips/t1": {...} }
  let authUser = null, authCb = null, offline = false, pendingUser = null;
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const stamp = () => ({ __ts: Date.now() });
  const rid = () => 'auto_' + Math.random().toString(36).slice(2, 9);

  function docRef(path) {
    return {
      path,
      async get() {
        if (offline) throw new Error('offline');
        const d = store[path];
        return { exists: !!d, id: path.split('/').pop(), data: () => clone(d) };
      },
      async set(v, opts) {
        if (offline) throw new Error('offline');
        store[path] = opts && opts.merge ? Object.assign({}, store[path] || {}, clone(v)) : clone(v);
      },
      async update(v) {
        if (offline) throw new Error('offline');
        store[path] = Object.assign({}, store[path] || {}, clone(v));
      },
      async delete() {
        if (offline) throw new Error('offline');
        delete store[path];
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
  window.firebase.firestore.FieldValue = { serverTimestamp: stamp };

  window.__test = {
    signIn(user) { pendingUser = user || null; return fakeAuth.signInWithPopup(); },
    signOut() { return fakeAuth.signOut(); },
    setOffline(v) { offline = !!v; },
    seed(path, obj) { store[path] = clone(obj); },
    dump() { return clone(store); },
    reset() { Object.keys(store).forEach((k) => delete store[k]); authUser = null; offline = false; pendingUser = null; },
  };
})();
