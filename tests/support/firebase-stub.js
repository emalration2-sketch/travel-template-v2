(function () {
  // Firestore 스텁 저장소: 같은 테스트 컨텍스트 내에서 page.reload() 를 넘어 유지되도록
  // sessionStorage 에 write-through 한다. (Playwright 는 테스트마다 컨텍스트가 격리되므로 누수 없음)
  const SS_KEY = '__fb_stub_store__';
  const readSS = () => { try { return JSON.parse(sessionStorage.getItem(SS_KEY)) || {}; } catch (e) { return {}; } };
  const store = readSS();       // { "users/u1": {...}, "users/u1/trips/t1": {...} }
  const persist = () => { try { sessionStorage.setItem(SS_KEY, JSON.stringify(store)); } catch (e) {} };
  // 실제 Firebase Auth 는 기본 persistence 가 LOCAL 이라 풀 페이지 네비게이션(예: 초대 링크 클릭)을
  // 넘어서도 로그인 세션이 유지된다 — 이 스텁도 같은 sessionStorage write-through 패턴으로 흉내낸다.
  const AUTH_SS_KEY = '__fb_stub_auth__';
  const readAuthSS = () => { try { return JSON.parse(sessionStorage.getItem(AUTH_SS_KEY)) || null; } catch (e) { return null; } };
  const persistAuth = () => { try { if (authUser) sessionStorage.setItem(AUTH_SS_KEY, JSON.stringify(authUser)); else sessionStorage.removeItem(AUTH_SS_KEY); } catch (e) {} };
  let authUser = readAuthSS(), authCb = null, offline = false, pendingUser = null;
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
  const errListeners = {}; // { [path]: Set<errCb> } — onSnapshot 의 두 번째(에러) 콜백
  function notify(path) {
    const set = listeners[path];
    if (!set || !set.size) return;
    const data = store[path];
    // Clone eagerly (synchronously, right now, at the moment notify() is
    // called) so snap.data() always returns the value as of this write,
    // even if a later write mutates store[path] in place (e.g. update()'s
    // setDeep) before the caller gets around to calling .data().
    const snapshot = clone(data);
    const exists = !!data;
    const id = path.split('/').pop();
    // Real Firestore never delivers a listener callback synchronously
    // within the write call itself — delivery is always asynchronous.
    // Deferring via a microtask here (instead of calling cb(snap)
    // synchronously) is also what makes onSnapshot's ordering guarantee
    // possible: onSnapshot() queues its initial-fire microtask at
    // subscribe time, and since microtasks run in FIFO order, a write's
    // notify() queued afterward (even with no `await` in between) is
    // guaranteed to be delivered after that already-queued initial fire.
    set.forEach(cb => {
      Promise.resolve().then(() => {
        // Skip delivery if the caller unsubscribed before this microtask ran.
        if (!listeners[path] || !listeners[path].has(cb)) return;
        cb({ exists, id, data: () => snapshot });
      });
    });
  }

  function docRef(path) {
    return {
      path,
      id: path.split('/').pop(),
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
      onSnapshot(cb, errCb) {
        if (!listeners[path]) listeners[path] = new Set();
        listeners[path].add(cb);
        // 실제 SDK 처럼 두 번째 인자(에러 콜백)를 받아둔다. 평상시에는 절대 호출되지 않고,
        // __test.triggerSnapshotError(path) 로 테스트가 명시적으로 발화시킬 때만 불린다.
        if (errCb) {
          if (!errListeners[path]) errListeners[path] = new Set();
          errListeners[path].add(errCb);
        }
        // Capture the initial snapshot SYNCHRONOUSLY (value + frozen clone),
        // right now at subscribe time, and only defer the *delivery* of that
        // already-captured value to a microtask. This guarantees:
        //   (a) ordering: a synchronous write() that happens right after
        //       onSnapshot() (no await in between) calls notify() which
        //       queues its own callback invocation in a *later* microtask
        //       than this one (already-scheduled), so the initial (old)
        //       value is always delivered before any subsequent (new) one.
        //   (b) freshness: .data() returns the value as of subscribe time,
        //       not whatever store[path] mutates into later.
        const initialData = store[path];
        const initialExists = !!initialData;
        const initialId = path.split('/').pop();
        const initialSnapshot = clone(initialData);
        Promise.resolve().then(() => {
          // Re-check the listener is still subscribed: if the caller
          // unsubscribed synchronously before this microtask ran, do not
          // fire the stray initial snapshot.
          if (!listeners[path] || !listeners[path].has(cb)) return;
          cb({ exists: initialExists, id: initialId, data: () => initialSnapshot });
        });
        return () => {
          if (listeners[path]) listeners[path].delete(cb);
          if (errCb && errListeners[path]) errListeners[path].delete(errCb);
        };
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
      where(field, op, value) {
        // 지원 연산자: array-contains (이 프로젝트에서 실제로 쓰는 것만 최소 구현)
        return {
          async get() {
            const prefix = path + '/';
            const docs = Object.keys(store)
              .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
              .map((k) => ({ id: k.slice(prefix.length), data: () => clone(store[k]), ref: docRef(k) }))
              .filter((d) => {
                const v = store[prefix + d.id] && store[prefix + d.id][field];
                if (op === 'array-contains') return Array.isArray(v) && v.includes(value);
                throw new Error('firebase-stub: 지원하지 않는 where 연산자: ' + op);
              });
            return { docs, empty: docs.length === 0, forEach: (f) => docs.forEach(f) };
          },
        };
      },
    };
  }
  const fakeAuth = {
    onAuthStateChanged(cb) { authCb = cb; Promise.resolve().then(() => cb(authUser)); return () => {}; },
    async signInWithPopup() {
      authUser = pendingUser || { uid: 'u1', displayName: '김진', email: 'emalration2@gmail.com', photoURL: '' };
      persistAuth();
      if (authCb) authCb(authUser);
      return { user: authUser };
    },
    async signOut() { authUser = null; persistAuth(); if (authCb) authCb(null); },
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
    seedTrip(tripId, oldFields) {
      store['trips/' + tripId] = clone({
        ownerUid: 'u1', members: ['u1'], memberNames: { u1: '김진' },
        title: oldFields.title || '', startDate: oldFields.startDate || '', endDate: oldFields.endDate || '', dayCount: oldFields.dayCount || 0,
      });
      if (oldFields.data !== undefined) {
        const st = JSON.parse(oldFields.data);
        if (!Array.isArray(st.travelers)) st.travelers = [];
        if (!Array.isArray(st.days)) st.days = [];
        if (!Array.isArray(st.notes)) st.notes = [];
        if (!Array.isArray(st.links)) st.links = [];
        if (!Array.isArray(st.attachments)) st.attachments = [];
        store['trips/' + tripId + '/content/main'] = clone(tripStateToContentDoc(st));
      }
      persist();
    },
    // 실제 Firestore 의 onSnapshot 에러(권한 거부/네트워크 실패)를 시뮬레이션한다.
    // 등록된 에러 콜백을 동기적으로 호출하며, 콜백이 몇 개 불렸는지 돌려준다.
    triggerSnapshotError(path, message) {
      const set = errListeners[path];
      if (!set || !set.size) return 0;
      const n = set.size;
      Array.from(set).forEach(cb => cb(new Error(message || 'permission-denied')));
      return n;
    },
    dump() { return clone(store); },
    reset() { Object.keys(store).forEach((k) => delete store[k]); persist(); authUser = null; persistAuth(); offline = false; pendingUser = null; },
  };
})();
