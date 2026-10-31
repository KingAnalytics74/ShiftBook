/*
 * platform.js — the storage layer Shiftbuck talks to.
 *
 * app.js uses a small document-store API (the same one the app had as a Claude artifact):
 *   db.doc(path)          -> { get, set, update, delete, onSnapshot, collection(name) }
 *   db.collection(path)   -> { doc(id), limit(n), get, onSnapshot, add }
 *   user.id()             -> Promise<string>   (waits until someone has signed in)
 *   downloads.save({filename, data})
 * Paths alternate collection/document: "data/users/<id>/main" is a document,
 * "data/users/<id>/main/shifts" is a collection of documents.
 *
 * Two back ends with the same API:
 *   - Supabase, when src/config.js has your project URL and key. Every document is one row in
 *     the `documents` table (see supabase/schema.sql); row-level security keeps each person's rows private.
 *   - This browser's localStorage, in demo mode.
 */
(function () {
  if (window.claude && window.claude.use) return; // running inside Claude: use the real runtime

  const auth = window.SBAuth;
  const parentOf = path => path.split("/").slice(0, -1).join("/");
  const snapDoc = (path, data) => ({ id: path.split("/").pop(), exists: data !== undefined && data !== null, data: () => data, metadata: { fromCache: false, hasPendingWrites: false } });
  const snapQuery = docs => ({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });
  const clone = d => JSON.parse(JSON.stringify(d));

  // ---------- shared listener plumbing ----------
  function makeStore(io) {
    const docL = new Map(), colL = new Map();
    async function notify(path) {
      if (docL.has(path) && docL.get(path).size) { const d = await io.read(path); docL.get(path).forEach(fn => fn(snapDoc(path, d))); }
      const col = parentOf(path);
      if (colL.has(col)) for (const l of colL.get(col)) l.fn(snapQuery(await io.list(col, l.limit)));
    }
    if (io.watch) io.watch(notify);
    function docRef(path) {
      return {
        id: path.split("/").pop(), path,
        get: async () => snapDoc(path, await io.read(path)),
        set: async data => { await io.write(path, clone(data)); notify(path); },
        update: async data => {
          const cur = await io.read(path);
          if (cur === undefined || cur === null) throw { code: "invalid_argument", message: "Document does not exist" };
          await io.write(path, { ...cur, ...clone(data) }); notify(path);
        },
        delete: async () => { await io.remove(path); notify(path); },
        onSnapshot(next, onErr) {
          if (!docL.has(path)) docL.set(path, new Set());
          docL.get(path).add(next);
          io.read(path).then(d => next(snapDoc(path, d)), e => onErr && onErr(e));
          return () => docL.get(path).delete(next);
        },
        collection: name => colRef(path + "/" + name)
      };
    }
    function colRef(path, limit) {
      return {
        path,
        doc: id => docRef(path + "/" + (id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8))),
        limit: n => colRef(path, n),
        get: async () => snapQuery(await io.list(path, limit)),
        add: async data => { const r = docRef(path + "/" + Date.now().toString(36)); await r.set(data); return r; },
        onSnapshot(next, onErr) {
          if (!colL.has(path)) colL.set(path, new Set());
          const l = { fn: next, limit }; colL.get(path).add(l);
          io.list(path, limit).then(docs => next(snapQuery(docs)), e => onErr && onErr(e));
          return () => colL.get(path).delete(l);
        }
      };
    }
    return { doc: docRef, collection: p => colRef(p) };
  }

  // ---------- demo mode: this browser's localStorage ----------
  function localIO() {
    const PREFIX = "shiftbook:";
    let ls = null; try { const k = PREFIX + "__test"; localStorage.setItem(k, "1"); localStorage.removeItem(k); ls = localStorage; } catch (e) {}
    if (!ls) return null;
    const read = async path => { try { const v = ls.getItem(PREFIX + path); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } };
    return {
      read,
      write: async (path, data) => ls.setItem(PREFIX + path, JSON.stringify(data)),
      remove: async path => ls.removeItem(PREFIX + path),
      list: async (col, limit) => {
        const depth = col.split("/").length + 1, out = [];
        // copy the key list before any await: a write elsewhere while we wait reorders localStorage's
        // indexes, and walking ls.key(i) across it skipped documents (a shift went missing from totals)
        const keys = [];
        for (let i = 0; i < ls.length; i++) keys.push(ls.key(i));
        for (const key of keys) {
          if (!key || !key.startsWith(PREFIX + col + "/")) continue;
          const path = key.slice(PREFIX.length);
          if (path.split("/").length === depth) out.push(snapDoc(path, await read(path)));
        }
        return out.sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit || 1000);
      },
      watch: notify => window.addEventListener("storage", e => { if (e.key && e.key.startsWith(PREFIX)) notify(e.key.slice(PREFIX.length)); })
    };
  }

  // ---------- Supabase: one row per document in public.documents ----------
  function supabaseIO(client) {
    let uid = null;
    const me = async () => uid || (uid = (await auth.session()).id);
    const check = r => { if (r.error) throw { code: r.error.code === "42501" ? "permission_denied" : "unavailable", message: r.error.message }; return r.data; };
    return {
      read: async path => { const rows = check(await client.from("documents").select("data").eq("path", path).limit(1)); return rows.length ? rows[0].data : undefined; },
      write: async (path, data) => { check(await client.from("documents").upsert({ path, parent: parentOf(path), user_id: await me(), data, updated_at: new Date().toISOString() }, { onConflict: "path" })); },
      remove: async path => { check(await client.from("documents").delete().eq("path", path)); },
      list: async (col, limit) => check(await client.from("documents").select("path,data").eq("parent", col).order("path").limit(limit || 1000)).map(r => snapDoc(r.path, r.data)),
      // live updates from other devices signed in to the same account
      watch: async notify => {
        const id = await me();
        client.channel("docs-" + id).on("postgres_changes", { event: "*", schema: "public", table: "documents", filter: "user_id=eq." + id },
          p => { const path = (p.new && p.new.path) || (p.old && p.old.path); if (path) notify(path); }).subscribe();
      }
    };
  }

  const io = auth && auth.mode === "supabase" ? supabaseIO(auth.client) : localIO();
  const db = io ? makeStore(io) : null;
  const user = {
    id: async () => (auth ? (await auth.session()).id : "local"),
    isOwner: async () => false, canEdit: async () => true, can: async () => true // moderators come from the community_moderators table, not from here
  };
  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  const services = { db, user, downloads };
  window.claude = { use: async name => services[name] || null };
})();
