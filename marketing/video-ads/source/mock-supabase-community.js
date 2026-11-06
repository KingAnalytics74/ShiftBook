// A stand-in for the Supabase client, used only to screenshot the community for the ads. Everything here is made up:
// Toby (signed in), King's job post and their private messages. No network requests are made.
(() => {
  const TOBY = "00000000-0000-4000-8000-0000000000b1", P_TOBY = "p-toby", P_KING = "p-king", P_ADE = "p-ade";
  const ago = m => new Date(Date.now() - m * 60000).toISOString();
  const docs = {
    [`data/users/${TOBY}/main`]: { name: "Toby", role: "Support Worker", hourlyRate: 12.85, sleepInRate: 45, periodStartDay: 1, serviceUsers: ["Alex"], workType: "care",
      pattern: { dayStart: "08:00", dayHours: 12, breakHrs: 1, sleepStart: "20:00", sleepEnd: "08:00" } },
    [`data/users/${TOBY}/profile`]: { ageGroup: "25-34", sex: null, area: "Leeds", employer: null, nickname: "Toby_cares", createdAt: ago(60 * 24 * 40) },
    [`data/users/${TOBY}/account`]: { status: "active", since: ago(60 * 24 * 40) },
    [`data/users/${TOBY}/money`]: { employment: "paye", taxCode: "1257L", pensionPct: 4, studentLoan: "none", pots: [] }
  };
  const parentOf = p => p.split("/").slice(0, -1).join("/");
  const posts = [
    { id: "post-king", author_id: P_KING, mine: false, nickname: "King_Leeds", area: "Leeds", space: "general", reply_to: null, hidden: false, created_at: ago(95),
      body: "We're hiring support workers in Leeds 🎉 Day and night shifts, sleep-ins paid. Message me if you're interested." },
    { id: "post-ade", author_id: P_ADE, mine: false, nickname: "Ade_nights", area: "Leeds", space: "pay", reply_to: null, hidden: false, created_at: ago(240),
      body: "Does anyone else get paid extra for waking nights? Mine is £14.50 an hour." }
  ];
  const people = [
    { id: P_TOBY, nickname: "Toby_cares", area: "Leeds", dm_open: true, created_at: ago(60 * 24 * 40), me: true },
    { id: P_KING, nickname: "King_Leeds", area: "Leeds", dm_open: true, created_at: ago(60 * 24 * 200), me: false },
    { id: P_ADE, nickname: "Ade_nights", area: "Leeds", dm_open: true, created_at: ago(60 * 24 * 90), me: false }
  ];
  const thread = [  // newest first, as the database returns it
    { id: "m3", body: "Thank you! Applying now 🙌", created_at: ago(58), mine: true },
    { id: "m2", body: "Yes, it's still open! Here's the link to apply: kingscare.example/jobs", created_at: ago(62), mine: false },
    { id: "m1", body: "Hi King, I saw your post. Is the support worker job still open?", created_at: ago(70), mine: true }
  ];
  const tables = {
    community_feed: () => posts, community_people: () => people, announcements_feed: () => [],
    documents: q => {
      if (q.eq.path) return docs[q.eq.path] ? [{ data: docs[q.eq.path], path: q.eq.path }] : [];
      if (q.eq.parent) return Object.keys(docs).filter(p => parentOf(p) === q.eq.parent).sort().map(p => ({ path: p, data: docs[p] }));
      return [];
    }
  };
  function from(table) {
    const q = { eq: {} }, b = {
      select: () => b, order: () => b, limit: () => b, in: () => b, neq: () => b,
      eq: (k, v) => { q.eq[k] = v; return b; },
      upsert: row => { if (table === "documents") docs[row.path] = row.data; return Promise.resolve({ data: null, error: null }); },
      delete: () => b,
      then: (ok, bad) => Promise.resolve({ data: (tables[table] || (() => []))(q), error: null }).then(ok, bad)
    };
    return b;
  }
  const rpcs = {
    dm_threads: () => [{ pid: P_KING, nickname: "King_Leeds", area: "Leeds", last_body: thread[0].body, last_at: thread[0].created_at, last_mine: true, unread: 0 }],
    dm_thread: a => (a.p_with === P_KING ? thread : []),
    dm_blocked: () => [], team_thread: () => [], community_is_moderator: () => false
  };
  const channel = () => { const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} }; return ch; };
  const session = { user: { id: TOBY, email: "toby@example.com" } };
  window.supabase = { createClient: () => ({
    auth: { getSession: async () => ({ data: { session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) },
    from, rpc: async (fn, a) => ({ data: rpcs[fn] ? rpcs[fn](a || {}) : null, error: null }), channel, removeChannel: () => {}
  }) };
})();
