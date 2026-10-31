/*
 * community-store.js — the carers' community, profiles and messages on Supabase.
 *
 * In demo mode this file does nothing and app.js keeps posts and messages in this browser.
 * With Supabase, people never read the tables directly. They read views that leave out user ids
 * (community_feed, community_people, announcements_feed) and do everything else through the
 * functions in supabase/schema.sql. So:
 *   - other carers only ever see a nickname and an area, never who is behind them;
 *   - a private message can only be read by the two carers in it (and by moderators, only if reported);
 *   - messages to the Shiftbuck team are read only by that carer and the team (community_moderators).
 * Data refreshes every 20 seconds, and every 8 seconds while a conversation is open.
 */
(function () {
  const A = window.SBAuth;
  if (!A || A.mode !== "supabase") return;
  window.makeCommunityStore = function () {
    const c = A.client;
    let cb = () => {}, isMod = false, timer = null, fast = null, open = null, busy = null;
    const st = { posts: [], hidden: new Set(), reports: [], dmReports: [], people: new Map(), team: { thread: [], unread: 0 },
      announcements: [], inbox: [], dms: { threads: [], blocked: new Set() }, open: null };
    const emit = () => cb({ ...st, isMod, isTeam: isMod, canDM: true });
    const rpc = async (fn, args) => { const { data, error } = await c.rpc(fn, args); if (error) throw error; return data; };
    const safe = async (p, d) => { try { return (await p) ?? d; } catch (e) { return d; } };
    const nickOf = pid => (st.people.get(pid) || {}).nick || "Carer";

    async function loadOpen() {
      if (!open) { st.open = null; return; }
      const key = open.kind + ":" + open.pid;
      if (open.kind === "dm") {
        const rows = await safe(rpc("dm_thread", { p_with: open.pid }), []);
        st.open = { key, msgs: rows.slice().reverse().map(r => ({ id: r.id, text: r.body, at: r.created_at, mine: r.mine, who: r.mine ? "You" : nickOf(open.pid) })) };
      } else if (open.kind === "inbox") {
        const rows = await safe(rpc("team_thread_for", { p_who: open.pid }), []);
        st.open = { key, msgs: rows.slice().reverse().map(r => ({ id: r.id, text: r.body, at: r.created_at, mine: r.from_team, who: r.from_team ? "Team" : nickOf(open.pid) })) };
      }
    }
    async function loadAll() {
      const [feed, people, team, ann, threads, blocked] = await Promise.all([
        c.from("community_feed").select("*").order("created_at", { ascending: false }).limit(500),
        c.from("community_people").select("*").limit(5000),
        safe(rpc("team_thread"), []),
        c.from("announcements_feed").select("*"),
        safe(rpc("dm_threads"), []),
        safe(rpc("dm_blocked"), [])
      ]);
      if (!feed.error) {
        st.posts = feed.data.map(r => ({ id: r.id, pid: r.author_id, mine: r.mine, nick: r.nickname, area: r.area, space: r.space, text: r.body, at: r.created_at, replyTo: r.reply_to }));
        st.hidden = new Set(feed.data.filter(r => r.hidden).map(r => r.id));
      }
      if (!people.error) {
        st.people = new Map(people.data.map(p => [p.id, { nick: p.nickname, area: p.area || "", since: p.created_at, me: p.me, dmOpen: p.dm_open, posts: st.posts.filter(x => x.pid === p.id).length }]));
      }
      const tt = team.slice().reverse();
      st.team = { thread: tt.map(r => ({ id: r.id, text: r.body, at: r.created_at, mine: !r.from_team, who: r.from_team ? "Shiftbuck team" : "You" })), unread: tt.filter(r => r.from_team && !r.read_at).length };
      st.announcements = ann.error ? [] : ann.data.map(a => ({ id: a.id, text: a.body, at: a.created_at }));
      st.dms = { threads: threads.map(r => ({ pid: r.pid, nick: r.nickname, area: r.area || "", last: { text: r.last_body, at: r.last_at, mine: r.last_mine }, unread: r.unread })),
                 blocked: new Set(blocked.map(x => (x && typeof x === "object" ? Object.values(x)[0] : x))) };
      if (isMod) {
        st.reports = (await safe(rpc("community_reports"), [])).map(r => ({ id: r.post_id, reason: r.reason }));
        st.dmReports = (await safe(rpc("dm_reports_list"), [])).map(r => ({ id: r.message_id, text: r.body, nick: r.sender_nickname, reason: r.reasons, count: r.reports, at: r.created_at }));
        st.inbox = (await safe(rpc("team_inbox"), [])).map(r => ({ pid: r.pid, nick: r.nickname, area: r.area || "", last: { text: r.last_body, at: r.last_at, mine: r.last_from_team }, unread: r.unread }));
      }
      await loadOpen();
      emit();
    }
    // one refresh at a time; a refresh asked for while one runs happens straight after it
    let again = false;
    async function load() {
      if (busy) { again = true; return busy; }
      busy = loadAll().catch(() => {}).finally(() => { busy = null; if (again) { again = false; load(); } });
      return busy;
    }
    const call = async (fn, args) => { await rpc(fn, args); await load(); };
    const visible = () => document.visibilityState === "visible";

    return {
      async start(onFeed) {
        cb = onFeed;
        try { isMod = !!(await rpc("community_is_moderator")); } catch (e) { isMod = false; }
        await load();
        clearInterval(timer); timer = setInterval(() => { if (visible()) load(); }, 20000);
        document.addEventListener("visibilitychange", () => { if (visible()) load(); });
      },
      // posts
      post: ({ space, text, replyTo, nick, area }) => call("community_post", { p_space: space, p_body: text, p_reply_to: replyTo || null, p_nickname: nick, p_area: area || null }),
      remove: id => call("community_delete", { p_id: id }),
      report: (id, reason) => call("community_report", { p_id: id, p_reason: reason }),
      hide: id => call("community_hide", { p_id: id, p_hidden: true }),
      unhide: id => call("community_hide", { p_id: id, p_hidden: false }),
      // profile
      async syncProfile({ nick, area }) {
        if (!nick) return;
        const me = [...st.people.values()].find(p => p.me);
        if (me && me.nick === nick && (me.area || "") === (area || "")) return;
        await call("community_upsert_profile", { p_nickname: nick, p_area: area || null });
      },
      setDmOpen: on => call("community_set_dm_open", { p_open: !!on }),
      // the Shiftbuck team
      sendToTeam: text => call("team_send", { p_body: text }),
      teamReply: (pid, text) => call("team_reply", { p_who: pid, p_body: text }),
      announce: text => call("announce", { p_body: text }),
      removeAnnouncement: id => call("announce_delete", { p_id: id }),
      // private messages between carers
      dmSend: (pid, text) => call("dm_send", { p_to: pid, p_body: text }),
      dmBlock: pid => call("dm_block", { p_who: pid }),
      dmUnblock: pid => call("dm_unblock", { p_who: pid }),
      dmReport: (id, reason) => call("dm_report", { p_message: id, p_reason: reason }),
      dmRestrict: id => call("dm_mod_restrict", { p_message: id }),
      // conversations
      async markRead(t) {
        if (t.kind === "team") await rpc("team_mark_read");
        else if (t.kind === "inbox") await rpc("team_mark_read_for", { p_who: t.pid });
        else if (t.kind === "dm") await rpc("dm_mark_read", { p_with: t.pid });
        await load();
      },
      async openThread(t) {
        open = t && t.kind !== "team" ? t : null; st.open = null; emit();
        clearInterval(fast); fast = setInterval(() => { if (visible()) load(); }, 8000);
        await load();
      },
      closeThread() { open = null; st.open = null; clearInterval(fast); emit(); }
    };
  };
})();
