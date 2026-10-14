/* Storage + sync core. No DOM: loaded by the page and by the service worker (background sync). */
const CORE = (() => {
  const DB_VER = 2;
  // Test mode keeps practice data in its own local database and its own server table, never mixed with project data.
  let MODE = 'live';
  const DEFAULT_URL = 'https://xmvzhxlqagstuvqvcyhc.supabase.co', DEFAULT_KEY = 'sb_publishable_SUcJNMK83_q6eTAVWLr-Rw_cVItt_6b';
  const setMode = m => { MODE = m === 'test' ? 'test' : 'live'; };
  const dbName = () => MODE === 'test' ? 'knf-field-data-TEST' : 'knf-field-data';
  const TBL = () => MODE === 'test' ? 'records_test' : 'records';
  const pathFor = p => (MODE === 'test' ? 'test/' : '') + p;
  const dbps = {};
  function db(name) {
    const n = name || dbName();
    if (!dbps[n]) dbps[n] = new Promise((res, rej) => {
      const q = indexedDB.open(n, DB_VER);
      q.onupgradeneeded = () => {
        const d = q.result;
        if (!d.objectStoreNames.contains('rec')) {
          const s = d.createObjectStore('rec', { keyPath: 'id' });
          s.createIndex('dirty', 'dirty');
        }
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); // photo id -> {blob, uploaded}
      };
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    return dbps[n];
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function tx(store, mode, fn, name) {
    const d = await db(name);
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode); let out;
      Promise.resolve(fn(t.objectStore(store))).then(v => out = v);
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  const allRecs = () => tx('rec', 'readonly', s => req(s.getAll()));
  const putRec = r => tx('rec', 'readwrite', s => { s.put(r); });
  const putMany = rs => tx('rec', 'readwrite', s => { rs.forEach(r => s.put(r)); });
  // sign-in and settings are shared by live and test mode (one account, one refresh token); everything else is per mode
  const SHARED = new Set(['session', 'settings', 'testplan']);
  const metaDb = k => SHARED.has(k) ? 'knf-field-data' : undefined;
  const getMeta = k => tx('meta', 'readonly', s => req(s.get(k)), metaDb(k));
  const setMeta = (k, v) => tx('meta', 'readwrite', s => { s.put(v, k); }, metaDb(k));
  async function dirtyRecs() { return (await allRecs()).filter(r => r.dirty); }
  const getBlob = id => tx('blobs', 'readonly', s => req(s.get(id)));
  const putBlob = (id, v) => tx('blobs', 'readwrite', s => { s.put(v, id); });
  const delBlob = id => tx('blobs', 'readwrite', s => { s.delete(id); });
  const blobKeys = () => tx('blobs', 'readonly', s => req(s.getAllKeys()));
  async function pendingPhotos() {
    const keys = await blobKeys(); let n = 0;
    for (const k of keys) { const b = await getBlob(k); if (b && !b.uploaded) n++; }
    return n;
  }
  /* fetch a photo that exists only on the server (taken on another device) and cache it */
  async function fetchPhoto(rec) {
    const c = await getBlob(rec.id); if (c) return c.blob;
    const { url, key } = await cfg(); const tok = await token().catch(() => null);
    if (!url || !tok || !rec.data.path) return null;
    const r = await fetch(`${url}/storage/v1/object/authenticated/photos/${pathFor(rec.data.path).split('/').map(encodeURIComponent).join('/')}`, { headers: { apikey: key, Authorization: `Bearer ${tok}` } });
    if (!r.ok) return null;
    const blob = await r.blob(); await putBlob(rec.id, { blob, uploaded: 1 }); return blob;
  }

  /* ---------- Supabase (PostgREST + GoTrue over plain fetch) ---------- */
  async function cfg() {
    const c = (await getMeta('settings')) || {};
    const sess = await getMeta('session');
    return { url: (c.sb_url || DEFAULT_URL).replace(/\/+$/, ''), key: c.sb_key || DEFAULT_KEY, sess };
  }
  async function signIn(email, password) {
    const { url, key } = await cfg();
    if (!url || !key) throw new Error('Add the Supabase URL and key in Settings first.');
    const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.message || 'Sign-in failed');
    const sess = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, email: j.user?.email, uid: j.user?.id };
    await setMeta('session', sess);
    return sess;
  }
  async function signOut() { await setMeta('session', null); }
  async function token() {
    const { url, key, sess } = await cfg();
    if (!sess) return null;
    if (Date.now() < sess.expires_at - 60000) return sess.access_token;
    const r = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: sess.refresh_token }) });
    if (!r.ok) { if (r.status === 400 || r.status === 401) await setMeta('session', { ...sess, expired: true }); throw new Error('Session expired, sign in again'); }
    const j = await r.json();
    const ns = { ...sess, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, expired: false };
    await setMeta('session', ns);
    return ns.access_token;
  }

  let running = null;
  /* Push local changes, then pull everything newer than the cursor. Returns {pushed, pulled}. */
  function sync() { if (!running) running = doSync().finally(() => running = null); return running; }
  async function doSync() {
    const { url, key, sess } = await cfg();
    if (!url || !key || !sess || sess.expired) return { skipped: 'not signed in' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { skipped: 'offline' };
    const tok = await token();
    const H = { apikey: key, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
    // Drafts (incomplete records) never leave the device. Photos wait until the record they belong to is finished.
    const recsNow = new Map((await allRecs()).map(r => [r.id, r]));
    const isDraft = r => !!r && !r.deleted && r.data && r.data._status === 'draft';
    const uploadable = r => {
      if (r.deleted) return true;
      for (let x = r, i = 0; x && i < 6; i++) { if (isDraft(x)) return false; x = x.parent ? recsNow.get(x.parent) : null; }
      return true;
    };
    // photos first, so a photo record never reaches the server before its image
    let photos = 0;
    for (const k of await blobKeys()) {
      const b = await getBlob(k); if (!b || b.uploaded) continue;
      const pr = recsNow.get(k); if (!pr || !pr.data.path || !uploadable(pr)) continue;
      if (pr.deleted) { await putBlob(k, { ...b, uploaded: 1 }); continue; }
      const res = await fetch(`${url}/storage/v1/object/photos/${pathFor(pr.data.path).split('/').map(encodeURIComponent).join('/')}`, { method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${tok}`, 'Content-Type': b.blob.type || 'image/jpeg', 'x-upsert': 'true' }, body: b.blob });
      if (!res.ok) throw new Error(`Photo upload failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
      await putBlob(k, { ...b, uploaded: 1 }); photos++;
    }
    // push
    const pendingBlobs = new Set();
    for (const k of await blobKeys()) { const b = await getBlob(k); if (b && !b.uploaded) pendingBlobs.add(k); }
    const dirty = (await dirtyRecs()).filter(r => uploadable(r) && !(r.tbl === 'photos' && pendingBlobs.has(r.id)));
    let pushed = 0;
    for (let i = 0; i < dirty.length; i += 400) {
      const batch = dirty.slice(i, i + 400);
      const body = batch.map(r => ({ id: r.id, tbl: r.tbl, site_id: r.site || null, parent_id: r.parent || null, data: r.data,
        created_at: r.created_at, updated_at: r.updated_at, created_by: r.created_by || null, updated_by: r.updated_by || null, deleted: !!r.deleted }));
      const res = await fetch(`${url}/rest/v1/${TBL()}?on_conflict=id`, { method: 'POST',
        headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
      // clear dirty only if not edited again meanwhile
      const fresh = await allRecs(); const byId = new Map(fresh.map(r => [r.id, r]));
      await putMany(batch.map(b => byId.get(b.id)).filter(r => r && r.dirty && batch.find(b => b.id === r.id).updated_at === r.updated_at)
        .map(r => ({ ...r, dirty: 0 })));
      pushed += batch.length;
    }
    // pull (1-minute overlap so late-committing writes are never skipped; applying twice is harmless)
    let cursor = (await getMeta('pull_cursor')) || '1970-01-01T00:00:00Z';
    const since = new Date(new Date(cursor).getTime() - 60000).toISOString();
    let pulled = 0, last = cursor;
    for (let page = 0; page < 200; page++) {
      const res = await fetch(`${url}/rest/v1/${TBL()}?select=*&synced_at=gt.${encodeURIComponent(since)}&order=synced_at.asc,id.asc&offset=${page * 1000}&limit=1000`, { headers: H });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const rows = await res.json();
      if (!rows.length) break;
      const local = new Map((await allRecs()).map(r => [r.id, r]));
      const apply = [];
      for (const s of rows) {
        const l = local.get(s.id);
        if (l && l.dirty && l.updated_at > s.updated_at) continue; // local edit is newer; it will be pushed next round
        if (l && !l.dirty && l.updated_at === s.updated_at && !!l.deleted === !!s.deleted) { if (s.synced_at > last) last = s.synced_at; continue; }
        apply.push({ id: s.id, tbl: s.tbl, site: s.site_id, parent: s.parent_id, data: s.data || {}, created_at: s.created_at, updated_at: s.updated_at,
          created_by: s.created_by, updated_by: s.updated_by, created_uid: s.created_uid || null, deleted: s.deleted ? 1 : 0, dirty: 0 });
        if (s.synced_at > last) last = s.synced_at;
      }
      await putMany(apply); pulled += apply.length;
      if (rows.length < 1000) break;
    }
    await setMeta('pull_cursor', last);
    await setMeta('last_sync', new Date().toISOString());
    return { pushed, pulled, photos };
  }
  /* people: the signed-in person's profile (name, role) and, for the PI, account management */
  async function rest(path, opts = {}) {
    const { url, key } = await cfg(); const tok = await token();
    if (!tok) throw new Error('Not signed in');
    const r = await fetch(url + path, { ...opts, headers: { apikey: key, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { }
    if (!r.ok) throw new Error((j && (j.error || j.message || j.msg)) || `Request failed (${r.status})`);
    return j;
  }
  async function myProfile() { const { sess } = await cfg(); if (!sess?.uid) return null; const j = await rest(`/rest/v1/profiles?id=eq.${sess.uid}&select=*`); return j && j[0] || null; }
  async function setMyName(name) { const { sess } = await cfg(); return rest(`/rest/v1/profiles?id=eq.${sess.uid}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name }) }); }
  const listProfiles = () => rest('/rest/v1/profiles?select=*&order=name.asc');
  /* first-sign-in password change: the user's own new password, then the "must change" flag is cleared */
  async function changePassword(password) {
    const { url, key } = await cfg(); const tok = await token(); if (!tok) throw new Error('Not signed in');
    const r = await fetch(`${url}/auth/v1/user`, { method: 'PUT', headers: { apikey: key, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.message || j.error_description || 'Could not change the password');
    return true;
  }
  const setMustChange = (id, on) => rest(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ must_change_pw: on }) });
  const adminCall = body => rest('/functions/v1/admin-users', { method: 'POST', body: JSON.stringify(body) });
  /* daily PDF reports: who gets them (null = the default for their role) and making / sending them now */
  const setReports = (id, on) => rest(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ email_reports: on }) });
  const reportsCall = body => rest('/functions/v1/daily-reports', { method: 'POST', body: JSON.stringify({ mode: MODE === 'test' ? 'test' : 'live', ...body }) });
  /* private KNF site list (downloaded after sign-in, cached on the device) */
  async function fetchRegistry() {
    const { url, key, sess } = await cfg(); if (!url || !sess || sess.expired) return null;
    const tok = await token();
    const r = await fetch(`${url}/rest/v1/site_registry?select=payload&id=eq.1`, { headers: { apikey: key, Authorization: `Bearer ${tok}` } });
    if (!r.ok) return null;
    const j = await r.json(); if (!j[0]) return null;
    await setMeta('registry', j[0].payload); return j[0].payload;
  }
  return { myProfile, setMyName, listProfiles, changePassword, setMustChange, adminCall, setReports, reportsCall, fetchRegistry, setMode, mode: () => MODE, db, allRecs, putRec, putMany, getMeta, setMeta, dirtyRecs, sync, signIn, signOut, cfg, getBlob, putBlob, delBlob, pendingPhotos, fetchPhoto };
})();
if (typeof self !== 'undefined') self.CORE = CORE;
