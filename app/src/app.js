/* Shiftbuck app logic. Built from the Shiftbuck for Carers edition: every path lives under data/users/<signed-in user id>/ */
/*
 * Shiftbuck — personal shift log, pay and budget app.
 *
 * MULTI-USER EDITION: every path below lives under the viewer's private subtree data/users/<id>/
 * DATA MODEL (artifact db)
 *   main          {name, role, hourlyRate, sleepInRate, periodStartDay, serviceUsers[], busFare}
 *   money         {employment: "paye"|"self", taxCode: "1257L"|"BR", pensionPct, studentLoan, pots[]}
 *                 pot = {id, name, mode: "pct"|"fixed", value, kind: "need"|"want"|"save"}
 *   main/shifts/<YYYY-MM-DD>  {date, users[], sleepIn, dayHours|null, breakHrs|null, fare|null, notes, jotformId?, updatedAt}
 *                 fare = bus fare the carer paid to get to and from that shift (£); never on the employer timesheet
 *   main/spend/<periodStart>  {<potId>: amountSpent, ...}
 *
 * PAY RULES   net hours = day hours − break; pay = net hours × hourlyRate + (sleepIn ? sleepInRate : 0)
 * PERIODS     run from periodStartDay of one month to the day before it next month
 * TAX         monthly estimate, 2026/27 rUK rates (see R below) — not a payslip
 * SYNC        none in this edition (no Jotform)
 */
(() => {
  if (!document.documentElement.lang) document.documentElement.lang = "en-GB";
  const DEFAULTS = { name: "", role: "Support Worker", hourlyRate: 13, sleepInRate: 40, periodStartDay: 26, serviceUsers: [], busFare: 0, pattern: { dayStart: "08:00", dayHours: 12, breakHrs: 2, sleepStart: "20:00", sleepEnd: "08:00" } };
  // Shift pattern for the one-tap shift types: day 08:00–20:00 (12 hours, 2 hours unpaid break), sleep-in 20:00–08:00.
  const pat = () => ({ ...DEFAULTS.pattern, ...(state.cfg.pattern || {}) });
  const addHrs = (hhmm, h) => { const [a, b] = hhmm.split(":").map(Number), m = ((a * 60 + b + Math.round(h * 60)) % 1440 + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };
  const $ = s => document.querySelector(s);
  const gbp = n => "£" + (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hrs = n => (Math.round(n * 10) / 10).toLocaleString("en-GB", { maximumFractionDigits: 1 });
  const pad = n => String(n).padStart(2, "0");
  const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const fmt = (d, o) => d.toLocaleDateString("en-GB", o);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const todayStr = ymd(new Date());

  const state = { cfg: { ...DEFAULTS }, shifts: new Map(), loaded: false, offset: 0, view: "overview", db: null, mcp: null, downloads: null, canWrite: true, editing: null, form: { users: new Set(), sleep: false } };

  // ---------- periods ----------
  function periodFor(d, k = 0) {
    const sd = state.cfg.periodStartDay || 26;
    let y = d.getFullYear(), m = d.getMonth();
    if (d.getDate() < sd) m -= 1;
    m += k;
    const start = new Date(y, m, sd);
    const end = addDays(new Date(y, m + 1, sd), -1);
    return { start, end };
  }
  const curPeriod = () => periodFor(new Date(), state.offset);
  function daysIn(p) { const out = []; for (let d = p.start; d <= p.end; d = addDays(d, 1)) out.push(d); return out; }

  // ---------- calc ----------
  function calc(s) {
    const day = Number(s.dayHours) || 0, brk = Number(s.breakHrs) || 0;
    const net = s.dayHours == null || s.dayHours === "" ? 0 : Math.max(0, day - brk);
    const hourly = net * state.cfg.hourlyRate;
    const sleep = s.sleepIn ? state.cfg.sleepInRate : 0;
    return { net, hourly, sleep, total: hourly + sleep, status: s.date > todayStr ? "Rostered" : "Worked" };
  }
  function summarise(p) {
    const rows = daysIn(p).map(d => { const k = ymd(d); const s = state.shifts.get(k); return { date: d, key: k, s, c: s ? calc(s) : null }; });
    const t = { gross: 0, hourly: 0, sleep: 0, net: 0, sleepIns: 0, shifts: 0, worked: 0, rostered: 0, dayHours: 0, breaks: 0, fares: 0, fareShifts: 0 };
    rows.forEach(r => { if (!r.c) return; t.shifts++; t.gross += r.c.total; t.hourly += r.c.hourly; t.sleep += r.c.sleep; t.net += r.c.net; t.dayHours += Number(r.s.dayHours) || 0; t.breaks += Number(r.s.breakHrs) || 0; if (Number(r.s.fare) > 0) { t.fares += Number(r.s.fare); t.fareShifts++; } if (r.s.sleepIn) t.sleepIns++; if (r.c.status === "Worked") t.worked += r.c.total; else t.rostered += r.c.total; });
    const weeks = [];
    rows.forEach((r, i) => { const w = Math.floor(i / 7); weeks[w] ||= { from: r.date, to: r.date, hourly: 0, sleep: 0, shifts: 0, net: 0 }; weeks[w].to = r.date; if (r.c) { weeks[w].hourly += r.c.hourly; weeks[w].sleep += r.c.sleep; weeks[w].shifts++; weeks[w].net += r.c.net; } });
    const users = new Map();
    rows.forEach(r => { if (!r.s) return; (r.s.users || []).forEach(u => { const x = users.get(u) || { shifts: 0, sleeps: 0, net: 0 }; x.shifts++; if (r.s.sleepIn) x.sleeps++; x.net += r.c.net; users.set(u, x); }); });
    return { rows, t, weeks, users };
  }

  // ---------- render ----------
  function render() {
    const p = curPeriod();
    const sm = summarise(p);
    $("#who").textContent = [state.cfg.name, state.cfg.role].filter(Boolean).join(" · ") || "Support Worker";
    $("#periodLabel").innerHTML = `${fmt(p.start, { day: "numeric", month: "short" })} – ${fmt(p.end, { day: "numeric", month: "short", year: "numeric" })}<small>${state.offset === 0 ? "Current pay period" : state.offset < 0 ? Math.abs(state.offset) + " period" + (state.offset < -1 ? "s" : "") + " ago" : "Upcoming"}</small>`;
    renderOverview(p, sm); renderSheet(p, sm); renderMoney(p, sm); renderForecast();
  }

  function renderOverview(p, sm) {
    const t = sm.t;
    $("#gross").textContent = gbp(t.gross);
    const dd = deductions(t.gross, state.money);
    $("#grossNet").innerHTML = `<span>Estimated take-home after tax, NI and pension <b>${gbp(dd.net)}</b></span><span>Unpaid breaks <b>${hrs(t.breaks)} hrs</b>, worth <b>${gbp(t.breaks * state.cfg.hourlyRate)}</b></span>${t.fares ? `<span>Bus fares you paid <b>${gbp(t.fares)}</b></span>` : ""}`;
    const g = t.gross || 1;
    $("#split").innerHTML = `<i style="width:${(t.worked / g) * 100}%;background:var(--day)"></i><i style="width:${(t.rostered / g) * 100}%;background:var(--amber)"></i>`;
    $("#splitLegend").innerHTML = `<span><span class="sw" style="background:var(--day)"></span>Earned so far <b>${gbp(t.worked)}</b></span><span><span class="sw" style="background:var(--amber)"></span>Still rostered <b>${gbp(t.rostered)}</b></span>`;
    const eff = t.net ? t.gross / t.net : 0;
    const kp = [["Shifts", t.shifts, `${daysIn(p).length - t.shifts} days off`], ["Net hours", hrs(t.net), `${hrs(t.breaks)} hrs breaks`], ["Sleep-ins", t.sleepIns, gbp(t.sleep)], ["Effective £/hr", gbp(eff), `base ${gbp(state.cfg.hourlyRate)}`]];
    $("#kpis").innerHTML = kp.map(([l, v, s]) => `<div class="kpi"><div class="eyebrow">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

    // weekly chart
    const W = 520, H = 200, padL = 8, padB = 34, padT = 22, n = sm.weeks.length;
    const max = Math.max(1, ...sm.weeks.map(w => w.hourly + w.sleep));
    const nice = Math.ceil(max / 200) * 200;
    const bw = (W - padL * 2) / n, inner = Math.min(56, bw * 0.6);
    const y = v => H - padB - (v / nice) * (H - padB - padT);
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Weekly earnings chart">`;
    [0, 0.5, 1].forEach(f => { const yy = y(nice * f); svg += `<line x1="${padL}" x2="${W - padL}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>`; });
    sm.weeks.forEach((w, i) => {
      const x = padL + i * bw + (bw - inner) / 2, tot = w.hourly + w.sleep;
      const yh = y(w.hourly), ys = y(tot);
      svg += `<rect x="${x}" y="${yh}" width="${inner}" height="${H - padB - yh}" fill="var(--day)" rx="3"/>`;
      if (w.sleep) svg += `<rect x="${x}" y="${ys}" width="${inner}" height="${yh - ys}" fill="var(--night)" rx="3"/>`;
      svg += `<text class="tot" x="${x + inner / 2}" y="${ys - 6}" text-anchor="middle">${tot ? "£" + Math.round(tot) : ""}</text>`;
      svg += `<text x="${x + inner / 2}" y="${H - padB + 15}" text-anchor="middle">Wk ${i + 1}</text>`;
      svg += `<text x="${x + inner / 2}" y="${H - padB + 28}" text-anchor="middle">${fmt(w.from, { day: "numeric", month: "short" })}</text>`;
    });
    $("#weekly").innerHTML = svg + "</svg>";

    // insights
    const ins = [];
    if (t.shifts) {
      const best = sm.weeks.reduce((a, w, i) => (w.hourly + w.sleep > a.v ? { v: w.hourly + w.sleep, i } : a), { v: -1, i: 0 });
      ins.push(`Week ${best.i + 1} (${fmt(sm.weeks[best.i].from, { day: "numeric", month: "short" })}) is your biggest week at <b class="num">${gbp(best.v)}</b>.`);
      ins.push(`Sleep-ins make up <b class="num">${Math.round((t.sleep / (t.gross || 1)) * 100)}%</b> of pay and lift your effective rate from ${gbp(state.cfg.hourlyRate)} to <b class="num">${gbp(eff)}</b> an hour.`);
      const top = [...sm.users.entries()].sort((a, b) => b[1].shifts - a[1].shifts)[0];
      if (top) ins.push(`${esc(top[0])} is on <b class="num">${Math.round((top[1].shifts / t.shifts) * 100)}%</b> of your shifts (${top[1].shifts} of ${t.shifts}).`);
      const prev = summarise(periodFor(new Date(), state.offset - 1)).t;
      if (prev.shifts) { const d = t.gross - prev.gross; ins.push(`That is <b class="num">${gbp(Math.abs(d))}</b> ${d >= 0 ? "more" : "less"} than the previous pay period (${gbp(prev.gross)}).`); }
      if (t.breaks) ins.push(`You give <b class="num">${hrs(t.breaks)} hours</b> of unpaid breaks this period, worth <b class="num">${gbp(t.breaks * state.cfg.hourlyRate)}</b> at your rate.`);
      if (t.fares) { const fh = sm_hours(t.fares); ins.push(`Bus fares cost you <b class="num">${gbp(t.fares)}</b> across ${t.fareShifts} shift${t.fareShifts === 1 ? "" : "s"} this period${fh ? `, about <b class="num">${fh < 1 ? Math.max(1, Math.round(fh * 60)) + " minutes" : fh + " hours"}</b> of work` : ""}.`); }
      if (t.rostered) ins.push(`<b class="num">${gbp(t.rostered)}</b> is still to come from rostered shifts.`);
    }
    $("#insights").innerHTML = ins.length ? ins.map(x => `<li><span>${x}</span></li>`).join("") : `<li><span>${state.loaded ? "No shifts in this period yet. Use Log shift to add one." : "Loading your shifts…"}</span></li>`;

    // calendar
    const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let cal = dows.map(d => `<div class="dow">${d[0]}</div>`).join("");
    const lead = (p.start.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) cal += `<div class="pad"></div>`;
    sm.rows.forEach(r => {
      let cls = "";
      if (r.s) cls = r.s.sleepIn && r.c.net ? "both" : r.s.sleepIn ? "night" : "day";
      if (r.key > todayStr) cls += " future";
      if (r.key === todayStr) cls += " today";
      const rx = restDay(r.key); if (rx.level === "red") cls += " rest-red"; else if (rx.level === "amber") cls += " rest-amber";
      cal += `<button class="${cls}" data-date="${r.key}" aria-label="${fmt(r.date, { weekday: "long", day: "numeric", month: "long" })}${r.c ? ", " + gbp(r.c.total) : ", day off"}"><span class="d">${r.date.getDate()}</span><span class="e">${r.c ? "£" + Math.round(r.c.total) : ""}</span></button>`;
    });
    $("#cal").innerHTML = cal;

    // users
    const us = [...sm.users.entries()].sort((a, b) => b[1].shifts - a[1].shifts);
    const umax = Math.max(1, ...us.map(u => u[1].shifts));
    $("#users").innerHTML = us.length ? us.map(([n, v]) => `<div class="hbar"><span>${esc(n)}</span><div class="track"><div class="fill" style="width:${(v.shifts / umax) * 100}%"></div></div><span class="val num">${v.shifts}</span></div>`).join("") : `<div class="empty">No shifts yet</div>`;

    renderCumulative(p, sm); renderDow(sm); renderRest(p, sm);
    // trend
    const periods = [];
    for (let k = -5; k <= 0; k++) { const pp = periodFor(new Date(), state.offset + k); const s = summarise(pp).t; periods.push({ p: pp, g: s.gross, n: s.shifts }); }
    const withData = periods.filter(x => x.n);
    $("#trendCard").hidden = withData.length < 2;
    if (withData.length >= 2) {
      const tmax = Math.max(...periods.map(x => x.g)) || 1;
      $("#trend").innerHTML = `<div class="hbars">${periods.filter(x => x.n || x === periods[periods.length - 1]).map(x => `<div class="hbar"><span>${fmt(x.p.start, { month: "short" })}–${fmt(x.p.end, { month: "short" })}</span><div class="track"><div class="fill" style="width:${(x.g / tmax) * 100}%;background:var(--night)"></div></div><span class="val num">${gbp(x.g)}</span></div>`).join("")}</div>`;
    }
  }

  // ---------- rest check ----------
  // Day-level guide based on UK Working Time Regulations: 24h off in every 7 days,
  // rest between shifts, 48h a week. Shifts carry no clock times, so these are approximations.
  const REST = { amberRun: 6, redRun: 7, amberHrs: 40, redHrs: 48 };
  const hasDayHrs = s => !!s && s.dayHours != null && s.dayHours !== "" && Number(s.dayHours) > 0;
  function worked(s) { return !!s && (!!s.sleepIn || hasDayHrs(s)); }
  function hours7(d, m) {
    let h = 0;
    for (let i = 0; i < 7; i++) { const s = m.get(ymd(addDays(d, -i))); if (hasDayHrs(s)) h += Math.max(0, Number(s.dayHours) - (Number(s.breakHrs) || 0)); }
    return Math.round(h * 10) / 10;
  }
  function restDay(key, m = state.shifts) {
    const d = parse(key), s = m.get(key), hrs = hours7(d, m);
    if (!worked(s)) return { level: "off", run: 0, hrs7: hrs, reasons: [] };
    let run = 0; for (let k = d; worked(m.get(ymd(k))) && run < 90; k = addDays(k, -1)) run++;
    const prev = m.get(ymd(addDays(d, -1)));
    const reasons = []; let level = "ok";
    const up = l => { if (l === "red" || (l === "amber" && level === "ok")) level = l; };
    if (run >= REST.redRun) { up("red"); reasons.push(`${run} days in a row without a day off`); }
    else if (run >= REST.amberRun) { up("amber"); reasons.push(`${run} days in a row, so the next day should be off`); }
    if (hrs > REST.redHrs) { up("red"); reasons.push(`${hrs} hours worked in the last 7 days, over 48`); }
    else if (hrs > REST.amberHrs) { up("amber"); reasons.push(`${hrs} hours worked in the last 7 days`); }
    if (prev && prev.sleepIn && hasDayHrs(prev) && hasDayHrs(s)) { up("red"); reasons.push("day shift, sleep-in, then another day shift: about 36 hours on duty"); }
    else if (prev && prev.sleepIn && hasDayHrs(s)) { up("amber"); reasons.push("straight from a sleep-in onto a day shift"); }
    return { level, run, hrs7: hrs, reasons };
  }
  function renderRest(p, sm) {
    const days = sm.rows.map(r => ({ r, x: restDay(r.key) }));
    const red = days.filter(d => d.x.level === "red"), amber = days.filter(d => d.x.level === "amber");
    const level = red.length ? "red" : amber.length ? "amber" : "ok";
    const card = $("#restCard"); card.className = "card restcard lvl-" + level;
    const pill = $("#restPill"); pill.className = "rpill " + level;
    pill.textContent = level === "red" ? "⚠ Not resting enough" : level === "amber" ? "Watch your rest" : "✓ Well rested";
    const top = days.reduce((a, d) => (d.x.run > a.x.run ? d : a), days[0]);
    const runFrom = top && top.x.run ? addDays(top.r.date, -(top.x.run - 1)) : null;
    const f = d => fmt(d, { day: "numeric", month: "short" });
    let head = "";
    if (level === "ok") head = "You're getting regular days off and breaks between shifts this period.";
    else if (top && top.x.run >= REST.amberRun) head = `You work <b>${top.x.run} days in a row</b> from ${f(runFrom)} to ${f(top.r.date)} with no full day off.`;
    else head = `${(red[0] || amber[0]).x.reasons[0].replace(/^./, c => c.toUpperCase())} on ${f((red[0] || amber[0]).r.date)}.`;
    if (level !== "ok") head += ` <b>${red.length}</b> day${red.length === 1 ? "" : "s"} in red and <b>${amber.length}</b> to watch.`;
    $("#restHead").innerHTML = head;
    $("#restStrip").innerHTML = days.map(d => {
      const tip = `<div class="t">${fmt(d.r.date, { weekday: "short", day: "numeric", month: "short" })}</div>${d.x.level === "off" ? "Day off" : d.x.reasons.length ? d.x.reasons.map(x => "• " + x).join("<br>") : "Worked, rested enough"}<br>Hours in last 7 days <b>${d.x.hrs7}</b>`;
      return `<i class="${d.x.level}${d.r.key === todayStr ? " today" : ""}" data-tip="${esc(tip)}"></i>`;
    }).join("");
    $("#restAx").innerHTML = `<span>${f(p.start)}</span><span>${f(p.end)}</span>`;
    const nowKey = todayStr < sm.rows[0].key ? sm.rows[0].key : todayStr > sm.rows[sm.rows.length - 1].key ? sm.rows[sm.rows.length - 1].key : todayStr;
    const now = restDay(nowKey), maxHrs = Math.max(...days.map(d => d.x.hrs7));
    $("#restKpis").innerHTML = [
      ["Days in a row now", now.run, now.run ? "since your last day off" : "you're off today"],
      ["Longest run", top ? top.x.run : 0, "days without a day off"],
      ["Days off", days.filter(d => d.x.level === "off").length, `of ${days.length} this period`],
      ["Busiest 7 days", hrs(maxHrs) + " hrs", maxHrs > REST.redHrs ? "over the 48-hour limit" : "under the 48-hour limit"]
    ].map(([l, v, sub]) => `<div class="kpi"><div class="eyebrow">${l}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join("");
  }

  // ---------- charts ----------
  const gbp0 = n => (n < 0 ? "−£" : "£") + Math.round(Math.abs(n)).toLocaleString("en-GB");
  function showTip(html, cx, cy) {
    const t = $("#tip"); t.innerHTML = html; t.hidden = false;
    const r = t.getBoundingClientRect();
    let x = cx + 14, y = cy - r.height - 12;
    if (x + r.width > innerWidth - 8) x = cx - r.width - 14;
    if (x < 8) x = 8; if (y < 8) y = cy + 18;
    t.style.left = x + "px"; t.style.top = y + "px";
  }
  function hideTip() { $("#tip").hidden = true; }
  document.addEventListener("pointermove", e => {
    const el = e.target.closest?.("[data-tip]");
    if (el) showTip(el.dataset.tip, e.clientX, e.clientY);
    else if (!e.target.closest?.(".hit")) hideTip();
  });
  document.addEventListener("pointerdown", e => { const el = e.target.closest?.("[data-tip]"); if (el) showTip(el.dataset.tip, e.clientX, e.clientY); });
  addEventListener("scroll", hideTip, { passive: true });
  const svgX = (svg, e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };

  function renderCumulative(p, sm) {
    const rows = sm.rows, n = rows.length;
    let c = 0; const cum = rows.map(r => (c += r.c ? r.c.total : 0));
    const ps = summarise(periodFor(new Date(), state.offset - 1));
    let c2 = 0; const prev = ps.t.shifts ? ps.rows.map(r => (c2 += r.c ? r.c.total : 0)) : null;
    $("#cumPrevKey").hidden = !prev;
    const W = 640, H = 250, L = 54, R2 = 92, T = 20, B = 28, pw = W - L - R2, ph = H - T - B;
    const maxV = Math.max(1, cum[n - 1], prev ? prev[Math.min(prev.length, n) - 1] : 0);
    const step = maxV > 2400 ? 1000 : maxV > 900 ? 500 : 200, top = Math.ceil(maxV / step) * step;
    const x = i => L + (n > 1 ? (i / (n - 1)) * pw : 0), y = v => T + ph - (v / top) * ph;
    const ti = rows.findIndex(r => r.key === todayStr);
    const solidEnd = todayStr > rows[n - 1].key ? n - 1 : todayStr < rows[0].key ? -1 : ti;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative earnings through the pay period">`;
    for (let v = 0; v <= top; v += step) s += `<line x1="${L}" x2="${L + pw}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${gbp0(v)}</text>`;
    rows.forEach((r, i) => { if (i % 7 === 0 || (i === n - 1 && (n - 1) % 7 >= 3)) s += `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${fmt(r.date, { day: "numeric", month: "short" })}</text>`; });
    if (prev) s += `<polyline points="${prev.slice(0, n).map((v, i) => `${x(i)},${y(v)}`).join(" ")}" fill="none" stroke="var(--faint)" stroke-width="1.5" stroke-linejoin="round"/>`;
    if (solidEnd >= 0) {
      const pts = cum.slice(0, solidEnd + 1).map((v, i) => `${x(i)},${y(v)}`).join(" ");
      s += `<polygon points="${x(0)},${y(0)} ${pts} ${x(solidEnd)},${y(0)}" fill="var(--day)" fill-opacity=".12"/>`;
      s += `<polyline points="${pts}" fill="none" stroke="var(--day)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    if (solidEnd < n - 1) { const st = Math.max(0, solidEnd); s += `<polyline points="${cum.slice(st).map((v, k) => `${x(st + k)},${y(v)}`).join(" ")}" fill="none" stroke="var(--day)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>`; }
    if (ti >= 0 && ti < n - 1) {
      s += `<line x1="${x(ti)}" x2="${x(ti)}" y1="${T - 6}" y2="${T + ph}" stroke="var(--ink)" stroke-width="1" stroke-dasharray="2 3"/><text class="axis" x="${x(ti)}" y="${T - 9}" text-anchor="middle">Today</text>`;
      s += `<circle cx="${x(ti)}" cy="${y(cum[ti])}" r="4.5" fill="var(--day)" stroke="var(--surface)" stroke-width="2"/><text class="lbl" x="${x(ti) - 8}" y="${y(cum[ti]) - 9}" text-anchor="end">${gbp0(cum[ti])} earned</text>`;
    }
    const endLbl = solidEnd >= n - 1 ? "total" : "if all rostered";
    s += `<circle cx="${x(n - 1)}" cy="${y(cum[n - 1])}" r="4.5" fill="var(--day)" stroke="var(--surface)" stroke-width="2"/><text class="lbl" x="${x(n - 1) + 9}" y="${y(cum[n - 1]) + 2}">${gbp0(cum[n - 1])}</text><text class="axis" x="${x(n - 1) + 9}" y="${y(cum[n - 1]) + 15}">${endLbl}</text>`;
    s += `<g id="cumX" style="display:none"><line y1="${T}" y2="${T + ph}" stroke="var(--muted)" stroke-width="1"/><circle r="5" fill="var(--day)" stroke="var(--surface)" stroke-width="2"/></g>`;
    s += `<rect class="hit" x="${L}" y="${T}" width="${pw}" height="${ph}"/></svg>`;
    $("#cum").innerHTML = s;
    const at = ti >= 0 ? ti : solidEnd >= 0 ? solidEnd : -1;
    $("#cumNote").textContent = prev && at >= 0 ? (() => { const dlt = cum[at] - (prev[Math.min(at, prev.length - 1)] || 0); return `${gbp0(Math.abs(dlt))} ${dlt >= 0 ? "ahead of" : "behind"} last period at this point`; })() : "";
    const svg = $("#cum svg"), g = $("#cumX"), hit = svg.querySelector(".hit");
    const move = e => {
      const i = Math.max(0, Math.min(n - 1, Math.round(((svgX(svg, e).x - L) / pw) * (n - 1))));
      g.style.display = ""; const ln = g.querySelector("line"), cc = g.querySelector("circle");
      ln.setAttribute("x1", x(i)); ln.setAttribute("x2", x(i)); cc.setAttribute("cx", x(i)); cc.setAttribute("cy", y(cum[i]));
      const r = rows[i];
      showTip(`<div class="t">${fmt(r.date, { weekday: "short", day: "numeric", month: "short" })}${r.key > todayStr && r.s ? " · rostered" : ""}</div>${r.s ? `${esc((r.s.users || []).join(", "))} · <b>${gbp(r.c.total)}</b>` : "Day off"}<br>Running total <b>${gbp(cum[i])}</b>${prev ? `<br>Last period by this day <b>${gbp(prev[Math.min(i, prev.length - 1)])}</b>` : ""}`, e.clientX, e.clientY);
    };
    hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { g.style.display = "none"; hideTip(); });
  }

  function renderDow(sm) {
    const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], full = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
    const agg = names.map(() => ({ h: 0, s: 0, n: 0, days: 0 }));
    sm.rows.forEach(r => { const k = (r.date.getDay() + 6) % 7; agg[k].days++; if (r.c) { agg[k].h += r.c.hourly; agg[k].s += r.c.sleep; agg[k].n++; } });
    const W = 640, H = 230, L = 8, T = 24, B = 40, ph = H - T - B, bw = (W - 2 * L) / 7, inner = Math.min(54, bw * 0.6);
    const max = Math.max(1, ...agg.map(a => a.h + a.s)), y = v => T + ph - (v / max) * ph, base = T + ph;
    const best = agg.reduce((b, a, i) => (a.h + a.s > agg[b].h + agg[b].s ? i : b), 0);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Earnings by day of the week"><line x1="${L}" x2="${W - L}" y1="${base}" y2="${base}" stroke="var(--line)"/>`;
    agg.forEach((a, i) => {
      const cx = L + i * bw + bw / 2, x0 = cx - inner / 2, tot = a.h + a.s;
      if (a.h) s += `<rect x="${x0}" y="${y(a.h)}" width="${inner}" height="${base - y(a.h)}" rx="4" fill="var(--day)"/>`;
      if (a.s) { const top = y(tot), bot = a.h ? y(a.h) - 2 : base; s += `<rect x="${x0}" y="${top}" width="${inner}" height="${Math.max(2, bot - top)}" rx="4" fill="var(--night)"/>`; }
      s += `<text class="lbl" x="${cx}" y="${(tot ? y(tot) : base) - 7}" text-anchor="middle"${i === best && tot ? ' style="font-size:12px"' : ""}>${tot ? gbp0(tot) : ""}</text>`;
      s += `<text class="axis" x="${cx}" y="${base + 15}" text-anchor="middle" style="${i === best && tot ? "fill:var(--ink);font-weight:700" : ""}">${names[i]}</text><text class="axis" x="${cx}" y="${base + 29}" text-anchor="middle">${a.n}/${a.days} worked</text>`;
      const tip = `<div class="t">${full[i]}</div>Worked <b>${a.n}</b> of ${a.days}<br>Hourly <b>${gbp(a.h)}</b> · Sleep-in <b>${gbp(a.s)}</b><br>Total <b>${gbp(tot)}</b>${a.n ? ` · avg <b>${gbp(tot / a.n)}</b> a shift` : ""}`;
      s += `<rect class="hit" x="${L + i * bw}" y="${T - 10}" width="${bw}" height="${ph + 44}" data-tip="${esc(tip)}"/>`;
    });
    $("#dow").innerHTML = s + "</svg>";
  }

  function renderWaterfall(g, d, byKind, net) {
    if (!d) return;
    const st = [{ l: "Gross", v: g, total: true, c: "var(--ink)", tip: "Gross pay from your shifts" }, { l: "Tax", v: -d.tax, c: "var(--amber)", tip: "Income tax" }, { l: "NI", v: -d.ni, c: "var(--amber)", tip: "National Insurance" }];
    if (d.pension) st.push({ l: "Pension", v: -d.pension, c: "var(--amber)", tip: "Workplace pension" });
    if (d.sl) st.push({ l: "Loan", v: -d.sl, c: "var(--amber)", tip: "Student loan" });
    st.push({ l: "Take-home", v: net, total: true, c: "var(--ink)", tip: "Take-home pay" });
    [["need", "Needs", "var(--day)"], ["want", "Wants", "var(--night)"], ["save", "Savings", "var(--c4)"]].forEach(([k, l, c]) => { if (byKind[k]) st.push({ l, v: -byKind[k], c, tip: `${l} in your plan` }); });
    const left = net - (byKind.need + byKind.want + byKind.save);
    st.push({ l: left >= 0 ? "Unplanned" : "Short", v: left, total: true, c: left >= 0 ? "var(--faint)" : "var(--amber)", tip: left >= 0 ? "Take-home not yet given a job" : "Your plan is bigger than your take-home" });
    let run = 0; const bars = st.map(b => { const from = b.total ? 0 : run, to = b.total ? b.v : run + b.v; run = b.total ? b.v : to; return { ...b, from, to }; });
    const lo = Math.min(0, ...bars.map(b => Math.min(b.from, b.to))), hi = Math.max(1, ...bars.map(b => Math.max(b.from, b.to)));
    const W = 640, H = 250, L = 6, T = 22, B = 26, ph = H - T - B, n = bars.length, bw = (W - 2 * L) / n, inner = Math.min(46, bw * 0.64);
    const y = v => T + ((hi - v) / (hi - lo)) * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Waterfall from gross pay to take-home and your spending plan"><line x1="${L}" x2="${W - L}" y1="${y(0)}" y2="${y(0)}" stroke="var(--muted)" stroke-width="1"/>`;
    bars.forEach((b, i) => {
      const cx = L + i * bw + bw / 2, x0 = cx - inner / 2, yt = y(Math.max(b.from, b.to)), yb = y(Math.min(b.from, b.to));
      s += `<rect x="${x0}" y="${yt}" width="${inner}" height="${Math.max(2, yb - yt)}" rx="4" fill="${b.c}"/>`;
      if (i < n - 1 && !bars[i + 1].total) s += `<line x1="${x0 + inner}" x2="${x0 + bw}" y1="${y(b.to)}" y2="${y(b.to)}" stroke="var(--faint)" stroke-dasharray="2 2"/>`;
      const lblY = b.v >= 0 || b.total ? yt - 6 : yt - 6;
      s += `<text class="lbl" x="${cx}" y="${lblY}" text-anchor="middle">${b.total ? gbp0(b.v) : gbp0(b.v)}</text>`;
      s += `<text class="axis" x="${cx}" y="${H - 6}" text-anchor="middle"${b.total ? ' style="fill:var(--ink);font-weight:700"' : ""}>${b.l}</text>`;
      const pct = g ? ` · ${Math.round((Math.abs(b.v) / g) * 100)}% of gross` : "";
      s += `<rect class="hit" x="${L + i * bw}" y="${T - 14}" width="${bw}" height="${ph + 40}" data-tip="${esc(`<div class="t">${b.tip}</div><b>${b.v < 0 && !b.total ? "−" + gbp(-b.v) : gbp(b.v)}</b>${pct}`)}"/>`;
    });
    $("#wf").innerHTML = s + "</svg>";
  }

  function renderBurn(spent, net, elapsed, total) {
    const ps = net ? spent / net : 0, pt = total ? elapsed / total : 0;
    const verdict = !spent ? "No spending logged yet" : ps > pt + 0.05 ? "Spending faster than the period is passing" : ps < pt - 0.05 ? "Spending slower than the period is passing" : "Spending in step with the period";
    $("#burn").innerHTML = `<div class="cap"><span>Spent <b>${Math.round(ps * 100)}%</b> of take-home</span><span><b>${Math.round(pt * 100)}%</b> of the pay period gone</span></div>
      <div class="bar" role="img" aria-label="${Math.round(ps * 100)}% of take-home spent, ${Math.round(pt * 100)}% of period gone"><div class="fill${ps > 1 ? " over" : ""}" style="width:${Math.min(100, ps * 100)}%"></div><div class="mark" style="left:calc(${Math.min(100, pt * 100)}% - 1px)" title="Today"></div></div>
      <div class="cap"><span>${verdict}</span><span>The black line marks today</span></div>`;
  }

  function renderSheet(p, sm) {
    const t = sm.t;
    let h = `<thead><tr><th>Date</th><th>Day</th><th>Service user(s)</th><th>Sleep-in</th><th>Day hrs</th><th>Break</th><th>Net hrs</th><th>Hourly £</th><th>Sleep-in £</th><th>Total £</th><th>Status</th></tr></thead><tbody>`;
    sm.rows.forEach(r => {
      const wk = r.date.getDay() === 0 || r.date.getDay() === 6;
      if (!r.s) { h += `<tr class="off clickable${wk ? " wkend" : ""}" data-date="${r.key}"><td>${fmt(r.date, { day: "2-digit", month: "short" })}</td><td>${fmt(r.date, { weekday: "short" })}</td><td>Day off</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`; return; }
      const s = r.s, c = r.c;
      h += `<tr class="clickable${wk ? " wkend" : ""}" data-date="${r.key}"><td>${fmt(r.date, { day: "2-digit", month: "short" })}</td><td>${fmt(r.date, { weekday: "short" })}</td><td>${esc((s.users || []).join(", "))}</td><td>${s.sleepIn ? '<span class="pill sleep">Yes</span>' : "No"}</td><td class="num">${s.dayHours == null || s.dayHours === "" ? "" : hrs(s.dayHours)}</td><td class="num">${s.breakHrs ? hrs(s.breakHrs) : ""}</td><td class="num">${c.net ? hrs(c.net) : ""}</td><td class="num">${c.hourly ? gbp(c.hourly) : ""}</td><td class="num">${c.sleep ? gbp(c.sleep) : ""}</td><td class="num"><b>${gbp(c.total)}</b></td><td><span class="pill ${c.status.toLowerCase()}">${c.status}</span></td></tr>`;
    });
    h += `</tbody><tfoot><tr><td colspan="3">Total · ${t.shifts} shifts</td><td>${t.sleepIns}</td><td class="num">${hrs(t.dayHours)}</td><td class="num">${hrs(t.breaks)}</td><td class="num">${hrs(t.net)}</td><td class="num">${gbp(t.hourly)}</td><td class="num">${gbp(t.sleep)}</td><td class="num">${gbp(t.gross)}</td><td></td></tr></tfoot>`;
    $("#sheet").innerHTML = h;
    $("#calc").innerHTML = `<div class="hbars">
      <div class="preview"><span>${hrs(t.net)} net hrs × ${gbp(state.cfg.hourlyRate)}</span><span class="num">${gbp(t.hourly)}</span></div>
      <div class="preview"><span>${t.sleepIns} sleep-ins × ${gbp(state.cfg.sleepInRate)}</span><span class="num">${gbp(t.sleep)}</span></div>
      <div class="preview" style="background:var(--day-soft)"><b>Gross pay</b><span class="num">${gbp(t.gross)}</span></div>
      <div class="preview" style="background:transparent;border:1px dashed var(--line)"><span>Unpaid breaks: ${hrs(t.breaks)} hrs × ${gbp(state.cfg.hourlyRate)} <span class="hint">(not paid)</span></span><span class="num" style="color:var(--muted)">${gbp(t.breaks * state.cfg.hourlyRate)}</span></div>${t.fares ? `<div class="preview" style="background:transparent;border:1px dashed var(--line)"><span>Bus fares on ${t.fareShifts} shift${t.fareShifts === 1 ? "" : "s"} <span class="hint">(paid by you, not on the timesheet)</span></span><span class="num" style="color:var(--muted)">${gbp(t.fares)}</span></div>` : ""}</div>`;
  }

  // ---------- views ----------
  function show(view) {
    if (state.needsSetup) return;
    state.view = view;
    ["overview", "log", "sheet", "money", "forecast", "community"].forEach(v => { $("#view-" + v).hidden = v !== view; });
    if (view === "community") renderCommunity();
    document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === view)));
    try { localStorage.setItem("sb.view", view); } catch (e) {}
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => { if (b.dataset.view === "log" && !state.editing) openLog(todayStr); show(b.dataset.view); }));
  $("#prev").onclick = () => { state.offset--; render(); };
  $("#next").onclick = () => { state.offset++; render(); };
  $("#cal").addEventListener("click", e => { const b = e.target.closest("button[data-date]"); if (b) { openLog(b.dataset.date); show("log"); } });
  $("#sheet").addEventListener("click", e => { const r = e.target.closest("tr[data-date]"); if (r) { openLog(r.dataset.date); show("log"); } });

  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }
  function setSync(cls, text) { $("#sync").innerHTML = `<span class="dot ${cls}"></span><span>${esc(text)}</span>`; }

  // ---------- log form ----------
  function renderUserChips() {
    const all = new Set([...(state.cfg.serviceUsers || []), ...state.form.users]);
    $("#fUsers").innerHTML = [...all].map(u => `<button type="button" class="chip" aria-pressed="${state.form.users.has(u)}" data-u="${esc(u)}">${esc(u)}</button>`).join("") + `<button type="button" class="chip ghost" id="addUserToggle">+ Other</button>`;
  }
  $("#fUsers").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.id === "addUserToggle") { $("#addUserRow").hidden = false; $("#fNewUser").focus(); return; }
    const u = b.dataset.u; state.form.users.has(u) ? state.form.users.delete(u) : state.form.users.add(u); renderUserChips(); preview();
  });
  $("#addUserBtn").onclick = () => { const v = $("#fNewUser").value.trim(); if (!v) return; state.form.users.add(v); $("#fNewUser").value = ""; $("#addUserRow").hidden = true; renderUserChips(); };
  $("#fNewUser").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("#addUserBtn").click(); } });
  function renderPresets() {
    const P = pat(), end = addHrs(P.dayStart, P.dayHours);
    const lab = { day: `Day · ${P.dayStart}–${end}`, sleep: `Sleep-in · ${P.sleepStart}–${P.sleepEnd}`, both: `Day + sleep-in · ${P.dayStart}–${P.sleepEnd}` };
    $("#fPreset").querySelectorAll("[data-pre]").forEach(b => { b.textContent = lab[b.dataset.pre]; });
  }
  $("#fPreset").addEventListener("click", e => {
    const b = e.target.closest("[data-pre]"); if (!b) return; const P = pat(), k = b.dataset.pre;
    if (k === "sleep") { $("#fHours").value = ""; $("#fBreak").value = ""; } else { $("#fHours").value = P.dayHours; $("#fBreak").value = P.breakHrs; }
    setSleep(k !== "day");
  });
  function setSleep(v) { state.form.sleep = v; $("#fSleep").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.v === "yes") === v))); preview(); }
  $("#fSleep").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setSleep(b.dataset.v === "yes"); });
  document.querySelectorAll("[data-h]").forEach(b => b.onclick = () => { $("#fHours").value = b.dataset.h; if (b.dataset.h === "12" && $("#fBreak").value === "") $("#fBreak").value = 2; preview(); });
  document.querySelectorAll("[data-b]").forEach(b => b.onclick = () => { $("#fBreak").value = b.dataset.b; preview(); });
  ["#fHours", "#fBreak", "#fFare"].forEach(s => $(s).addEventListener("input", preview));
  $("#fFareQuick").addEventListener("click", e => { const b = e.target.closest("[data-fare]"); if (!b) return; $("#fFare").value = b.dataset.fare === "usual" ? (state.cfg.busFare || "") : ""; preview(); });
  $("#fDate").addEventListener("change", () => { const v = $("#fDate").value; if (v) openLog(v); });

  // "Usual" fare button follows the bus fare saved in settings
  function fareUsualUI() {
    const usual = Number(state.cfg.busFare) || 0;
    $("#fFareUsual").hidden = !usual; $("#fFareUsual").textContent = `Usual · ${gbp(usual)}`;
  }
  function formShift() {
    const h = $("#fHours").value, b = $("#fBreak").value;
    return { date: $("#fDate").value, users: [...state.form.users], sleepIn: state.form.sleep, dayHours: h === "" ? null : Number(h), breakHrs: b === "" ? null : Number(b), fare: $("#fFare").value === "" ? null : Math.round(Number($("#fFare").value) * 100) / 100, notes: $("#fNotes").value.trim() };
  }
  function preview() {
    const f = formShift();
    $("#fPreview").textContent = gbp(calc(f).total);
    const bk = f.dayHours != null ? Number(f.breakHrs) || 0 : 0;
    $("#fBreakNote").hidden = !bk;
    if (bk) $("#fBreakNote").textContent = `Unpaid break: ${hrs(bk)} hrs, worth ${gbp(bk * state.cfg.hourlyRate)} at your rate.`;
    const fare = Number(f.fare) || 0, pay = calc(f).total;
    $("#fFareNote").hidden = !(fare > 0 && pay > 0);
    if (fare > 0 && pay > 0) $("#fFareNote").textContent = `After your ${gbp(fare)} bus fare, this shift leaves you ${gbp(pay - fare)} before tax.`;
    const w = $("#restWarn");
    if (!f.date || !worked(f)) { w.hidden = true; return; }
    const m = new Map(state.shifts); m.set(f.date, f);
    const x = restDay(f.date, m), nx = restDay(ymd(addDays(parse(f.date), 1)), m);
    const worst = x.level === "red" || nx.level === "red" ? "red" : x.level === "amber" ? "amber" : "";
    if (!worst) { w.hidden = true; return; }
    w.className = "banner " + worst; w.hidden = false;
    w.textContent = (worst === "red" ? "Not resting enough: " : "Watch your rest: ") + (x.reasons[0] || nx.reasons[0]) + ".";
  }

  function openLog(date) {
    const s = state.shifts.get(date);
    state.editing = date;
    $("#fDate").value = date;
    state.form.users = new Set(s?.users || []);
    $("#fHours").value = s?.dayHours ?? "";
    $("#fBreak").value = s?.breakHrs ?? "";
    $("#fNotes").value = s?.notes || "";
    $("#fFare").value = s ? (s.fare ?? "") : (Number(state.cfg.busFare) || "");
    fareUsualUI();
    setSleep(!!s?.sleepIn);
    $("#logTitle").textContent = s ? "Edit shift" : "Log a shift";
    $("#editNote").hidden = !s;
    if (s) $("#editNote").textContent = `There is already a shift on ${fmt(parse(date), { weekday: "long", day: "numeric", month: "long" })}. Saving replaces it.`;
    $("#delBtn").hidden = !s; $("#delConfirm").hidden = true; $("#formError").hidden = true;
    $("#saveBtn").textContent = s ? "Save changes" : "Save shift";
    renderUserChips(); preview();
  }

  function validate(s) {
    if (!s.date) return "Pick the shift date.";
    if (!s.users.length) return "Pick at least one service user.";
    if (s.dayHours == null && !s.sleepIn) return "Add day hours, or mark it as a sleep-in.";
    if (s.dayHours != null && (s.dayHours < 0 || s.dayHours > 24)) return "Day hours must be between 0 and 24.";
    if (s.breakHrs != null && s.dayHours == null) return "A break needs day hours too.";
    if (s.breakHrs != null && s.breakHrs >= s.dayHours) return "The break is as long as the shift. Check the hours.";
    if (s.fare != null && (!(s.fare >= 0) || s.fare > 200)) return "The bus fare should be between £0 and £200.";
    return "";
  }

  async function syncJotform(s) {
    if (!state.mcp) { setSync("ok", "Saved · private to you"); return; }
    const qa = [{ question_text: "Shift date", answer: s.date }, { question_text: "Service user(s)", answer: s.users.join(", ") }, { question_text: "Sleep-in?", answer: s.sleepIn ? "Yes" : "No" }];
    if (s.dayHours != null) qa.push({ question_text: "Day hours", answer: String(s.dayHours) });
    if (s.breakHrs != null) qa.push({ question_text: "Break (hours)", answer: String(s.breakHrs) });
    if (s.notes) qa.push({ question_text: "Notes", answer: s.notes });
    setSync("", "Sending to Jotform…");
    try {
      const res = await state.mcp.callTool("Jotform", "create_submission", { question_answers: qa }, { cache: false });
      const id = res?.payload?.data?.submission_id || null;
      if (id && state.db) { try { await S.shifts().doc(s.date).update({ jotformId: id }); } catch (e) {} }
      setSync("ok", "Synced to Jotform");
    } catch (e) {
      const msg = { needs_reauth: "Reconnect Jotform in Settings → Connectors", server_not_connected: "Add the Jotform connector to sync", not_in_manifest: "Jotform sync is turned off for this page", approval_required: "Allow Jotform to sync copies", blocked_by_policy: "Jotform is blocked by your organisation" }[e?.code] || "Saved here · Jotform copy did not send";
      setSync("warn", msg);
    }
  }

  $("#logForm").addEventListener("submit", async e => {
    e.preventDefault();
    const s = formShift(); const err = validate(s);
    if (err) { $("#formError").textContent = err; $("#formError").hidden = false; return; }
    $("#formError").hidden = true;
    if (!state.db) { $("#formError").textContent = "Saving isn't available. Sign in again, or check that this browser allows site storage."; $("#formError").hidden = false; return; }
    $("#saveBtn").disabled = true;
    const body = { ...s, updatedAt: new Date().toISOString() };
    try {
      await S.shifts().doc(s.date).set(body);
      const newOnes = s.users.filter(u => !(state.cfg.serviceUsers || []).includes(u));
      if (newOnes.length) { state.cfg.serviceUsers = [...(state.cfg.serviceUsers || []), ...newOnes]; try { await S.main().set({ ...state.cfg }); } catch (e) {} }
      toast(`Shift saved · ${gbp(calc(s).total)}`);
      state.editing = null; show("overview");
      syncJotform(s);
    } catch (e2) {
      $("#formError").textContent = e2?.code === "invalid_argument" ? "Shiftbuck couldn't save. Sign out and back in, then try again." : "The shift didn't save. Check your connection and try again.";
      $("#formError").hidden = false;
    } finally { $("#saveBtn").disabled = false; }
  });
  $("#delBtn").onclick = () => { $("#delText").textContent = `Delete the shift on ${fmt(parse(state.editing), { weekday: "long", day: "numeric", month: "long" })}?`; $("#delConfirm").hidden = false; };
  $("#delNo").onclick = () => { $("#delConfirm").hidden = true; };
  $("#delYes").onclick = async () => {
    try { await S.shifts().doc(state.editing).delete(); toast("Shift deleted"); state.editing = null; show("overview"); }
    catch (e) { $("#formError").textContent = "The shift wasn't deleted. Try again."; $("#formError").hidden = false; }
  };

  // ---------- timesheet actions ----------
  function csv() {
    const p = curPeriod(), sm = summarise(p);
    // quote every text cell; Excel runs a cell starting with = + - or @ as a formula, so those get a leading '
    const q = v => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
    const name = (state.cfg.name || "").trim();
    const head = [["Employee", q(name || "Not set")], ["Role", q(state.cfg.role || "")],
      ["Pay period", `${ymd(p.start)} to ${ymd(p.end)}`], ["Hourly rate", state.cfg.hourlyRate], ["Sleep-in rate", state.cfg.sleepInRate], []].map(r => r.join(","));
    const lines = [...head, ["Date", "Day", "Service user(s)", "Sleep-in", "Day hours", "Break", "Net hours", "Hourly pay", "Sleep-in pay", "Total", "Notes"].join(",")];
    sm.rows.forEach(r => { const s = r.s, c = r.c; lines.push([r.key, fmt(r.date, { weekday: "short" }), s ? q((s.users || []).join(", ")) : "Day off", s ? (s.sleepIn ? "Y" : "N") : "", s?.dayHours ?? "", s?.breakHrs ?? "", c ? c.net : "", c ? c.hourly.toFixed(2) : "", c ? c.sleep.toFixed(2) : "", c ? c.total.toFixed(2) : "", s?.notes ? q(s.notes) : ""].join(",")); });
    lines.push(["TOTAL", "", "", sm.t.sleepIns, sm.t.dayHours, sm.t.breaks, sm.t.net, sm.t.hourly.toFixed(2), sm.t.sleep.toFixed(2), sm.t.gross.toFixed(2), ""].join(","));
    return { text: lines.join("\n"), name: `Timesheet_${(name || "worker").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${ymd(p.start)}_to_${ymd(p.end)}.csv` };
  }
  $("#csvBtn").onclick = async () => {
    if (!state.downloads) { toast("Downloads aren't available in this view"); return; }
    const f = csv();
    try { await state.downloads.save({ filename: f.name, data: f.text }); } catch (e) { if (e?.code !== "cancelled") toast("The file wasn't saved"); }
  };
  // Full JSON backup: every shift, setting, plan and spending record (also the hand-off format for a future GitHub build)
  $("#backupBtn").onclick = async () => {
    if (!state.downloads) { toast("Downloads aren't available in this view"); return; }
    // app: "Shiftbook" is the backup format's label from before the rename to Shiftbuck; kept so old and new backups match
    const data = { exportedAt: new Date().toISOString(), app: "Shiftbook", schemaVersion: 1, config: state.cfg, money: state.money,
      shifts: [...state.shifts.values()].sort((a, b) => a.date.localeCompare(b.date)), spend: Object.fromEntries(state.spend), payslips: Object.fromEntries(state.payslips) };
    try { await state.downloads.save({ filename: `Shiftbuck_backup_${todayStr}.json`, data: JSON.stringify(data, null, 2) }); } catch (e) { if (e?.code !== "cancelled") toast("The backup wasn't saved"); }
  };
  $("#copyBtn").onclick = async () => {
    const p = curPeriod(), t = summarise(p).t;
    const txt = `Timesheet – ${state.cfg.name || ""} (${state.cfg.role})\nPay period: ${fmt(p.start, { day: "numeric", month: "short" })} – ${fmt(p.end, { day: "numeric", month: "short", year: "numeric" })}\nShifts: ${t.shifts}\nNet hours: ${hrs(t.net)} × ${gbp(state.cfg.hourlyRate)} = ${gbp(t.hourly)}\nSleep-ins: ${t.sleepIns} × ${gbp(state.cfg.sleepInRate)} = ${gbp(t.sleep)}\nGross pay: ${gbp(t.gross)}`;
    try { await navigator.clipboard.writeText(txt); toast("Summary copied"); } catch (e) { toast("Copy isn't available here"); }
  };

  // ---------- settings ----------
  function fillSettings() {
    renderPresets();
    $("#sName").value = state.cfg.name || ""; $("#sRole").value = state.cfg.role || "";
    $("#sRate").value = state.cfg.hourlyRate; $("#sSleep").value = state.cfg.sleepInRate;
    $("#sStart").value = state.cfg.periodStartDay; $("#sUsers").value = (state.cfg.serviceUsers || []).join(", ");
    { const names = [...new Set([...(state.cfg.serviceUsers || []), ...[...state.shifts.values()].flatMap(s => s.users || [])])].sort((a, b) => a.localeCompare(b));
      const cur = $("#rnFrom").value; $("#rnFrom").innerHTML = names.length ? names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join("") : `<option value="">No names yet</option>`;
      if (names.includes(cur)) $("#rnFrom").value = cur; }
    $("#sFare").value = state.cfg.busFare || "";
    fareUsualUI();
    // a new shift opened before settings loaded picks up the usual fare
    if (state.editing && !state.shifts.has(state.editing) && $("#fFare").value === "" && Number(state.cfg.busFare) > 0) { $("#fFare").value = state.cfg.busFare; preview(); }
  }
  $("#setForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!state.db) { toast("Settings can't be saved in this view"); return; }
    const next = { name: $("#sName").value.trim(), role: $("#sRole").value.trim(), hourlyRate: Number($("#sRate").value) || 0, sleepInRate: Number($("#sSleep").value) || 0, periodStartDay: Math.min(28, Math.max(1, Number($("#sStart").value) || 1)), serviceUsers: $("#sUsers").value.split(",").map(x => x.trim()).filter(Boolean), busFare: Math.max(0, Math.round((Number($("#sFare").value) || 0) * 100) / 100) };
    try { await S.main().set({ ...state.cfg, ...next }); toast("Settings saved"); } catch (e2) { toast("Settings didn't save"); }
  });

  // Rename a service user everywhere: the list in settings and every shift that names them
  $("#rnBtn").onclick = async () => {
    const from = $("#rnFrom").value, to = $("#rnTo").value.trim();
    if (!from) return;
    if (!to) { toast("Type the new initials or code"); $("#rnTo").focus(); return; }
    if (to === from) { toast("That's the same name"); return; }
    if (!state.db) { toast("Renaming isn't available in this view"); return; }
    $("#rnBtn").disabled = true;
    try {
      let n = 0;
      for (const [k, s] of state.shifts) {
        if (!(s.users || []).includes(from)) continue;
        await S.shifts().doc(k).set({ ...s, users: [...new Set(s.users.map(u => (u === from ? to : u)))], updatedAt: new Date().toISOString() }); n++;
      }
      const list = [...new Set((state.cfg.serviceUsers || []).map(u => (u === from ? to : u)))];
      const next = { ...state.cfg, serviceUsers: list.includes(to) ? list : [...list, to] };
      if (next.userPlaces && next.userPlaces[from] != null) { const m = { ...next.userPlaces }; if (m[to] == null) m[to] = m[from]; delete m[from]; next.userPlaces = m; }
      await S.main().set(next);
      $("#rnTo").value = ""; toast(`${from} is now ${to} in ${n} shift${n === 1 ? "" : "s"}`);
    } catch (e) { toast("That didn't finish. Try again."); }
    finally { $("#rnBtn").disabled = false; }
  };

  // ---------- money ----------
  // 2026/27 rates (England, Wales & NI): personal allowance £12,570; basic rate 20% on next £37,700, 40% above;
  // employee NI 8% from £1,048/month to £4,189/month, 2% above; self-employed Class 4 6% / 2%;
  // auto-enrolment qualifying earnings £520–£4,189/month; student loan monthly thresholds below.
  const R = { FREE_M: 1048.25, ADD_M: 125140 / 12, PA: 12570, BASIC: 37700, PT_M: 1048, UEL_M: 4189, QE_LO_M: 520, QE_HI_M: 4189,
    SL: { p1: [2241, 0.09], p2: [2448, 0.09], p4: [2816, 0.09], p5: [2083, 0.09], pg: [1750, 0.06] } };
  const MONEY_DEFAULTS = { employment: "paye", taxCode: "1257L", pensionPct: 4, studentLoan: "none", pots: [] };
  const KIND = { need: "Needs", want: "Wants", save: "Savings" };
  state.money = { ...MONEY_DEFAULTS }; state.spend = new Map(); state.planDraft = null; state.builtKey = "";
  let spendTimer;

  // Tax codes: number + L/M/N/T (allowance = number x 10 + 9 a year), K codes (amount added to pay),
  // BR / D0 / D1 (one flat rate), 0T (no allowance), NT (no tax). S = Scotland, C = Wales; W1/M1/X = emergency.
  function parseTaxCode(raw) {
    const c = String(raw || "1257L").toUpperCase().replace(/\s+/g, "").replace(/(W1|M1|X)$/, "");
    const region = /^S/.test(c) ? "scotland" : /^C/.test(c) ? "wales" : "ruk", body = c.replace(/^[SC](?=\d|K|BR|D0|D1|NT|0T)/, "");
    if (body === "BR") return { ok: true, kind: "flat", rate: 0.2, region };
    if (body === "D0") return { ok: true, kind: "flat", rate: 0.4, region };
    if (body === "D1") return { ok: true, kind: "flat", rate: 0.45, region };
    if (body === "NT") return { ok: true, kind: "none", region };
    if (body === "0T") return { ok: true, kind: "std", freeM: 0, region };
    let m = body.match(/^K(\d{1,4})$/);
    if (m) return { ok: true, kind: "std", freeM: -(Number(m[1]) * 10 + 9) / 12, k: true, region };
    m = body.match(/^(\d{1,4})[LMNT]$/);
    if (m) return { ok: true, kind: "std", freeM: (Number(m[1]) * 10 + 9) / 12, region };
    return { ok: false, kind: "std", freeM: R.FREE_M, region: "ruk" };
  }
  function deductions(g, mc) {
    const pct = (Number(mc.pensionPct) || 0) / 100;
    const pension = mc.employment === "paye" ? Math.max(0, Math.min(g, R.QE_HI_M) - R.QE_LO_M) * pct : g * pct;
    const paM = R.PA / 12, basicM = R.BASIC / 12;
    let tax;
    const tc = parseTaxCode(mc.taxCode);
    if (mc.employment !== "paye") { const t = Math.max(0, g - paM); tax = Math.min(t, basicM) * 0.2 + Math.max(0, t - basicM) * 0.4; }
    else if (tc.kind === "none") tax = 0;
    else if (tc.kind === "flat") tax = Math.floor(g) * tc.rate;
    else {
      const t = Math.max(0, Math.floor(g - tc.freeM));
      tax = Math.min(t, basicM) * 0.2 + Math.max(0, Math.min(t, R.ADD_M) - basicM) * 0.4 + Math.max(0, t - R.ADD_M) * 0.45;
      if (tc.k) tax = Math.min(tax, g * 0.5); // K-code tax can't exceed half of pay
    }
    const lo = mc.employment === "paye" ? R.PT_M : paM, rate = mc.employment === "paye" ? 0.08 : 0.06;
    const ni = Math.max(0, Math.min(g, R.UEL_M) - lo) * rate + Math.max(0, g - R.UEL_M) * 0.02;
    const L = R.SL[mc.studentLoan];
    const sl = L ? Math.max(0, g - L[0]) * L[1] : 0;
    return { tax, ni, pension, sl, net: Math.max(0, g - tax - ni - pension - sl) };
  }
  const pots = () => state.planDraft || state.money.pots || [];
  const planned = (pot, net) => pot.mode === "fixed" ? Number(pot.value) || 0 : (Number(pot.value) || 0) / 100 * net;
  const spendFor = key => state.spend.get(key) || {};

  function renderMoney(p, sm) {
    const mc = state.money, g = sm.t.gross, d = deductions(g, mc), self = mc.employment === "self";
    state.moneyNet = d.net; state.moneyKey = ymd(p.start); state.moneyD = d; state.moneyG = g;
    $("#mNet").textContent = gbp(d.net);
    const parts = [["Take-home", d.net, "var(--day)"], [self ? "Tax to set aside" : "Income tax", d.tax, "var(--amber)"], [self ? "NI to set aside" : "National Insurance", d.ni, "var(--night)"], ["Pension", d.pension, "var(--ink)"], ["Student loan", d.sl, "var(--faint)"]].filter(x => x[1] > 0.004 || x[0] === "Take-home");
    const gg = g || 1;
    $("#mSplit").innerHTML = parts.map(x => `<i style="width:${(x[1] / gg) * 100}%;background:${x[2]}"></i>`).join("");
    $("#mLegend").innerHTML = parts.map(x => `<span><span class="sw" style="background:${x[2]}"></span>${x[0]} <b>${gbp(x[1])}</b></span>`).join("");
    const keep = g ? d.net / g : 0;
    $("#mKpis").innerHTML = [
      ["You keep", g ? Math.round(keep * 100) + "p" : "–", "of every £1 earned"],
      ["Per shift", gbp(sm.t.shifts ? d.net / sm.t.shifts : 0), "take-home on average"],
      ["Per net hour", gbp(sm.t.net ? d.net / sm.t.net : 0), "after tax, sleep-ins included"],
      ["Yearly pace", gbp(d.net * 12), "if every period is like this"]
    ].map(([l, v, s]) => `<div class="kpi"><div class="eyebrow">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
    const steps = [["Gross pay from your shifts", g, ""], [self ? "Income tax to set aside" : `Income tax (code ${String(mc.taxCode || "1257L").toUpperCase()})`, -d.tax, "minus"], [self ? "Class 4 NI to set aside" : "National Insurance", -d.ni, "minus"]];
    if (d.pension) steps.push([`Pension (${mc.pensionPct}%)`, -d.pension, "minus"]);
    if (d.sl) steps.push(["Student loan", -d.sl, "minus"]);
    steps.push(["Take-home", d.net, "total"]);
    if (sm.t.fares) { steps.push(["Bus fares to work (you paid)", -sm.t.fares, "minus"]); steps.push(["Left after travel", d.net - sm.t.fares, "total"]); }
    $("#mSteps").innerHTML = steps.map(([l, v, c]) => `<div class="step ${c}"><span>${l}</span><span class="num">${v < 0 ? "−" + gbp(-v) : gbp(v)}</span></div>`).join("");
    if (document.activeElement?.closest?.("#taxForm") == null) {
      $("#tEmp").value = mc.employment; $("#tCode").value = mc.taxCode; $("#tPension").value = mc.pensionPct; $("#tLoan").value = mc.studentLoan;
    }
    $("#tCode").disabled = self;
    const tcI = parseTaxCode(mc.taxCode);
    $("#tCodeHelp").textContent = self ? "Not used when you're self-employed." : !tcI.ok ? `"${mc.taxCode}" isn't a tax code Shiftbuck recognises, so it's using 1257L. Check your payslip.` : tcI.region === "scotland" ? "Scottish tax bands aren't supported yet, so this uses UK rates." : tcI.kind === "flat" ? `All your pay is taxed at ${Math.round(tcI.rate * 100)}%.` : tcI.kind === "none" ? "No tax is taken with this code." : tcI.k ? `K code: about ${gbp(-tcI.freeM)} a month is added to your taxable pay.` : `About ${gbp(tcI.freeM)} a month is tax-free.`;
    $("#tCodeHelp").style.color = !self && !tcI.ok ? "var(--bad)" : "";
    const key = state.moneyKey + "|" + JSON.stringify(pots()) + "|" + JSON.stringify(spendFor(state.moneyKey));
    const typing = $("#planRows").contains(document.activeElement);
    if (key !== state.builtKey && !typing) { buildPlanRows(); state.builtKey = key; }
    updatePlanNumbers();
    renderPayslip(p, sm);
  }

  // ---------- payslip check ----------
  // A payslip is stored against the Shiftbuck pay period it covers (doc id = period start date).
  state.payslips = new Map(); state.payEditing = null;
  const payCol = () => S.main().collection("payslips");
  function renderPayslip(p, sm) {
    const key = ymd(p.start), ps = state.payslips.get(key), editing = state.payEditing === key;
    $("#payHint").textContent = `For work ${fmt(p.start, { day: "numeric", month: "short" })} – ${fmt(p.end, { day: "numeric", month: "short" })}`;
    $("#payForm").hidden = !editing; $("#payEdit").hidden = editing;
    $("#payEdit").textContent = ps ? "Edit this payslip" : "Add the payslip for this period";
    if (!ps) { $("#payBody").innerHTML = `<p class="hint" style="margin:0">No payslip saved for this period yet. When it arrives, add it here and Shiftbuck checks it against your logged shifts and its own tax maths.</p>`; return; }
    const app = sm.t.shifts ? { hours: sm.t.net, gross: sm.t.gross, ...deductions(sm.t.gross, state.money) } : null;
    const hF = v => hrs(v) + " hrs";
    const row = (label, slip, est, f = gbp) => {
      if (!app || est == null) return `<tr><td>${label}</td><td class="num">${f(slip)}</td>${app ? "<td></td><td></td>" : ""}</tr>`;
      const diff = slip - est, ok = Math.abs(diff) < 1;
      return `<tr><td>${label}</td><td class="num">${f(slip)}</td><td class="num">${f(est)}</td><td class="num ${ok ? "okc" : "badc"}">${ok ? "✓ matches" : (diff > 0 ? "+" : "−") + f(Math.abs(diff))}</td></tr>`;
    };
    const head = `<thead><tr><th></th><th>Payslip</th>${app ? "<th>Your shifts</th><th>Difference</th>" : ""}</tr></thead>`;
    const body = [row("Hours paid", ps.hours, app?.hours, hF), row("Gross pay", ps.gross, app?.gross), row("Income tax", ps.tax, app?.tax), row("National Insurance", ps.ni, app?.ni), row("Pension", ps.pension, app?.pension), row("Net pay", ps.net, app?.net)].join("");
    // deductions re-worked on the payslip's own gross: proves the tax engine independently of hours
    const own = deductions(ps.gross, state.money);
    const checks = [["Income tax", ps.tax, own.tax], ["National Insurance", ps.ni, own.ni], ["Pension", ps.pension, own.pension]];
    const bad = checks.filter(([, a, b]) => Math.abs(a - b) >= 1);
    let notes = bad.length ? `<div class="banner warn">On this payslip's gross, Shiftbuck's ${bad.map(b => b[0].toLowerCase()).join(" and ")} ${bad.length > 1 ? "differ" : "differs"} from your payslip (${bad.map(([l, a, b]) => `${l}: payslip ${gbp(a)}, Shiftbuck ${gbp(b)}`).join("; ")}).${bad.some(b => b[0] === "Pension") && ps.gross > 520 ? ` Your payslip pension works out at ${Math.round((ps.pension / (Math.min(ps.gross, 4189) - 520)) * 1000) / 10}% of qualifying earnings, so set "Pension you pay" to that.` : ""}</div>`
      : `<div class="banner ok">✓ Shiftbuck's tax, NI and pension maths matches this payslip to within £1.</div>`;
    if (!app) notes += `<p class="hint" style="margin:8px 0 0">No shifts were logged in Shiftbuck for this period, so only the deductions are checked.</p>`;
    else if (Math.abs(ps.gross - app.gross) >= 1) {
      const more = app.gross - ps.gross;
      notes += `<div class="banner ${more > 0 ? "bad" : "warn"}" style="margin-top:8px">${more > 0 ? `Your logged shifts come to <b>${gbp(more)}</b> more than this payslip.` : `This payslip is <b>${gbp(-more)}</b> more than your logged shifts. A shift may be missing from Shiftbuck.`}${more > 0 && !(ps.sleepPay > 0) && sm.t.sleep > 0 ? ` The payslip shows no sleep-in pay, but you logged ${sm.t.sleepIns} sleep-ins worth ${gbp(sm.t.sleep)}. Ask payroll how sleep-ins are being paid.` : more > 0 ? " Check for hours that weren't paid." : ""}</div>`;
    }
    $("#payBody").innerHTML = `<div class="tablewrap" style="margin-bottom:10px"><table class="paytable">${head}<tbody>${body}</tbody></table></div>${notes}${ps.payDate ? `<p class="hint" style="margin:8px 0 0">Paid ${fmt(parse(ps.payDate), { day: "numeric", month: "long", year: "numeric" })}.</p>` : ""}`;
  }
  $("#payEdit").onclick = () => {
    const key = state.moneyKey, ps = state.payslips.get(key) || {};
    state.payEditing = key;
    $("#pDate").value = ps.payDate || ""; $("#pHours").value = ps.hours ?? ""; $("#pGross").value = ps.gross ?? ""; $("#pSleep").value = ps.sleepPay ?? 0;
    $("#pTax").value = ps.tax ?? ""; $("#pNi").value = ps.ni ?? ""; $("#pPension").value = ps.pension ?? ""; $("#pNet").value = ps.net ?? "";
    $("#payErr").hidden = true; render();
  };
  $("#payCancel").onclick = () => { state.payEditing = null; render(); };
  $("#payForm").addEventListener("submit", async e => {
    e.preventDefault();
    const n = id => $(id).value === "" ? null : Number($(id).value);
    const d = { payDate: $("#pDate").value || null, hours: n("#pHours"), gross: n("#pGross"), sleepPay: n("#pSleep") || 0, tax: n("#pTax"), ni: n("#pNi"), pension: n("#pPension") || 0, net: n("#pNet") };
    if ([d.hours, d.gross, d.tax, d.ni, d.net].some(v => v == null || isNaN(v))) { $("#payErr").textContent = "Fill in hours, gross pay, income tax, National Insurance and net pay as they appear on the payslip."; $("#payErr").hidden = false; return; }
    if (!state.db) { $("#payErr").textContent = "Payslips can't be saved in this view."; $("#payErr").hidden = false; return; }
    try { await payCol().doc(state.payEditing).set(d); state.payEditing = null; toast("Payslip saved"); render(); }
    catch (e2) { $("#payErr").textContent = "The payslip didn't save. Try again."; $("#payErr").hidden = false; }
  });

  function buildPlanRows() {
    const sp = spendFor(state.moneyKey);
    const list = pots();
    $("#planRows").innerHTML = list.length ? list.map(pt => `
      <div class="pot kind-${pt.kind || "need"}" data-id="${esc(pt.id)}">
        <div class="ptop"><input class="pname" type="text" id="pn-${esc(pt.id)}" value="${esc(pt.name)}" aria-label="Pot name"><button type="button" class="pdel" aria-label="Remove ${esc(pt.name)}">×</button></div>
        <span class="pplanned num" id="pp-${esc(pt.id)}"></span>
        <div class="pplan">
          <input type="number" id="pv-${esc(pt.id)}" value="${esc(pt.value)}" min="0" step="0.5" inputmode="decimal" aria-label="Plan amount">
          <select id="pm-${esc(pt.id)}" aria-label="Plan type"><option value="pct"${pt.mode !== "fixed" ? " selected" : ""}>% of pay</option><option value="fixed"${pt.mode === "fixed" ? " selected" : ""}>£ fixed</option></select>
          <select id="pk-${esc(pt.id)}" aria-label="Pot type">${Object.entries(KIND).map(([k, l]) => `<option value="${k}"${(pt.kind || "need") === k ? " selected" : ""}>${l}</option>`).join("")}</select>
        </div>
        <label class="pspent"><span class="hint">Spent £</span><input type="number" id="ps-${esc(pt.id)}" value="${sp[pt.id] ?? ""}" min="0" step="0.01" inputmode="decimal"></label>
        <div class="pbar"><i id="pb-${esc(pt.id)}"></i></div>
        <div class="pfoot"><span id="pl-${esc(pt.id)}"></span><span id="pc-${esc(pt.id)}"></span></div>
      </div>`).join("") : `<div class="empty">${state.loaded ? "No pots yet. Add one to start planning your take-home." : "Loading your plan…"}</div>`;
  }

  function updatePlanNumbers() {
    const net = state.moneyNet || 0, sp = spendFor(state.moneyKey), list = pots();
    const byKind = { need: 0, want: 0, save: 0 }; let total = 0, spentTotal = 0;
    list.forEach(pt => {
      const pl = planned(pt, net), s = Number(sp[pt.id]) || 0;
      total += pl; spentTotal += s; byKind[pt.kind || "need"] += pl;
      const el = id => document.getElementById(id + "-" + pt.id);
      if (!el("pp")) return;
      el("pp").textContent = gbp(pl);
      const r = pl ? s / pl : s ? 1.01 : 0;
      el("pb").style.width = Math.min(100, r * 100) + "%"; el("pb").className = r > 1 ? "over" : "";
      el("pl").textContent = s ? (s <= pl ? `${gbp(pl - s)} left` : `${gbp(s - pl)} over plan`) : "Nothing spent yet";
      el("pc").textContent = pt.kind === "save" ? (s ? `${gbp(s)} put away` : "") : (pl && sm_hours(pl) ? `≈ ${sm_hours(pl)} hrs of work` : "");
    });
    const left = net - total;
    $("#mAlloc").textContent = list.length ? `${gbp(total)} planned of ${gbp(net)} · ${left >= 0 ? gbp(left) + " not yet assigned" : gbp(-left) + " over your take-home"}` : "";
    const base = Math.max(net, total) || 1;
    const segs = [["need", "var(--day)"], ["want", "var(--night)"], ["save", "var(--c4)"]];
    $("#mPlanBar").innerHTML = segs.map(([k, c]) => `<i style="width:${(byKind[k] / base) * 100}%;background:${c}"></i>`).join("") + (left > 0 ? `<i style="width:${(left / base) * 100}%;background:var(--sunk)"></i>` : "");
    $("#mPlanLegend").innerHTML = segs.map(([k, c]) => `<span><span class="sw" style="background:${c}"></span>${KIND[k]} <b>${gbp(byKind[k])}</b> <span class="num">${net ? Math.round((byKind[k] / net) * 100) : 0}%</span></span>`).join("") + `<span>Spent so far <b>${gbp(spentTotal)}</b></span>`;
    renderWaterfall(state.moneyG || 0, state.moneyD, byKind, net);
    renderSpendAnalytics(net, list, sp);
    const pctSum = list.filter(x => x.mode !== "fixed").reduce((a, x) => a + (Number(x.value) || 0), 0);
    $("#fitPlan").hidden = !(net > 0 && pctSum > 0 && Math.abs(left) > 0.5);
    $("#savePlan").disabled = !state.planDraft;
    $("#savePlan").textContent = state.planDraft ? "Save plan" : "Plan saved";
  }
  function renderSpendAnalytics(net, list, sp) {
    const p = curPeriod(), total = daysIn(p).length, today = parse(todayStr);
    const elapsed = today < p.start ? 0 : today > p.end ? total : Math.round((today - p.start) / 864e5) + 1;
    const daysLeft = total - elapsed;
    const rows = list.map(pt => ({ pt, plan: planned(pt, net), spent: Number(sp[pt.id]) || 0 }));
    const spent = rows.reduce((a, r) => a + r.spent, 0);
    const left = net - spent;
    const pace = elapsed && spent ? (spent / elapsed) * total : 0;
    $("#sEmpty").hidden = spent > 0;
    renderBurn(spent, net, elapsed, total);
    $("#sKpis").innerHTML = [
      ["Spent so far", gbp(spent), `${net ? Math.round((spent / net) * 100) : 0}% of take-home`],
      ["Left to spend", gbp(left), left >= 0 ? "of this period's take-home" : "more than you take home"],
      ["Per day left", daysLeft ? gbp(Math.max(0, left) / daysLeft) : "–", daysLeft ? `for the ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "period has ended"],
      ["On pace for", pace ? gbp(pace) : "–", pace ? "by the end of this period" : "needs some spending first"]
    ].map(([l, v, s]) => `<div class="kpi"><div class="eyebrow">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

    const max = Math.max(1, ...rows.map(r => Math.max(r.plan, r.spent)));
    $("#sPots").innerHTML = rows.length ? rows.map(r => {
      const over = r.spent > r.plan;
      return `<div class="pvs"><span class="nm" title="${esc(r.pt.name)}">${esc(r.pt.name)}</span>
        <div class="tr"><div class="pl" style="width:${(r.plan / max) * 100}%"></div><div class="sp${over ? " over" : ""}" style="width:calc(${(r.spent / max) * 100}% - 6px);${r.spent ? "" : "display:none"}"></div></div>
        <span class="fig">${gbp(r.spent)} of ${gbp(r.plan)}${over ? ` · ${gbp(r.spent - r.plan)} over` : ""}</span></div>`;
    }).join("") : `<div class="empty">No pots in your plan yet.</div>`;

    const byKind = { need: 0, want: 0, save: 0 };
    rows.forEach(r => (byKind[r.pt.kind || "need"] += r.spent));
    const segs = [["need", "var(--day)"], ["want", "var(--night)"], ["save", "var(--c4)"]];
    const base = Math.max(net, spent) || 1;
    $("#sKindBar").innerHTML = segs.map(([k, c]) => `<i style="width:${(byKind[k] / base) * 100}%;background:${c}"></i>`).join("");
    $("#sKindLegend").innerHTML = segs.map(([k, c]) => `<span><span class="sw" style="background:${c}"></span>${KIND[k]} <b>${gbp(byKind[k])}</b></span>`).join("") + `<span><span class="sw" style="background:var(--sunk);border:1px solid var(--line)"></span>Not spent <b>${gbp(Math.max(0, left))}</b></span>`;

    const ins = [];
    const planTotal = rows.reduce((a, r) => a + r.plan, 0);
    if (planTotal > net + 0.5) ins.push(`Your plan is <b class="num">${gbp(planTotal - net)}</b> more than your take-home. Trim some pots so it balances.`);
    const overs = rows.filter(r => r.spent > r.plan + 0.005).sort((a, b) => (b.spent - b.plan) - (a.spent - a.plan));
    overs.slice(0, 2).forEach(r => ins.push(`${esc(r.pt.name)} is <b class="num">${gbp(r.spent - r.plan)}</b> over plan.`));
    if (spent) {
      const top = rows.slice().sort((a, b) => b.spent - a.spent)[0];
      ins.push(`${esc(top.pt.name)} is your biggest spend: <b class="num">${Math.round((top.spent / spent) * 100)}%</b> of everything spent.`);
      ins.push(`You've put away <b class="num">${gbp(byKind.save)}</b>, which is ${net ? Math.round((byKind.save / net) * 100) : 0}% of your take-home.`);
      if (pace > net) ins.push(`At this pace you'll spend <b class="num">${gbp(pace - net)}</b> more than you take home by ${fmt(p.end, { day: "numeric", month: "short" })}.`);
      else if (pace) ins.push(`At this pace you'll finish the period with about <b class="num">${gbp(net - pace)}</b> spare.`);
      const hrsLeft = sm_hours(Math.max(0, left));
      if (left < 0) ins.push(`Covering the overspend takes about <b class="num">${sm_hours(-left)}</b> more hours of work.`);
      else if (hrsLeft) ins.push(`What you have left is worth about <b class="num">${hrsLeft}</b> hours of work.`);
    }
    $("#sInsights").innerHTML = ins.length ? ins.map(x => `<li><span>${x}</span></li>`).join("") : `<li><span>Nothing to flag yet. Your plan fits your take-home.</span></li>`;

    // trend across pay periods that have spending recorded
    const hist = [...state.spend.entries()].map(([k, amounts]) => {
      const s = Object.values(amounts || {}).reduce((a, v) => a + (Number(v) || 0), 0);
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return null;
      const pp = periodFor(parse(k)); const g = summarise(pp).t.gross;
      return { k, pp, s, net: deductions(g, state.money).net };
    }).filter(Boolean).sort((a, b) => a.k.localeCompare(b.k)).slice(-6);
    $("#sTrendWrap").hidden = hist.length < 2;
    if (hist.length >= 2) {
      const tm = Math.max(...hist.map(h => Math.max(h.s, h.net))) || 1;
      $("#sTrend").innerHTML = hist.map(h => `<div class="pvs"><span class="nm">${fmt(h.pp.start, { day: "numeric", month: "short" })} – ${fmt(h.pp.end, { day: "numeric", month: "short" })}</span>
        <div class="tr"><div class="pl" style="width:${(h.net / tm) * 100}%"></div><div class="sp${h.s > h.net ? " over" : ""}" style="width:calc(${(h.s / tm) * 100}% - 6px)"></div></div>
        <span class="fig">${gbp(h.s)} spent of ${gbp(h.net)} take-home</span></div>`).join("");
    }
  }
  // hours of work needed to earn a take-home amount, at this period's take-home per net hour
  function sm_hours(amount) {
    const p = curPeriod(), t = summarise(p).t, d = deductions(t.gross, state.money);
    const perHr = t.net ? d.net / t.net : 0;
    return perHr ? Math.round((amount / perHr) * 10) / 10 : 0;
  }

  function draft() { if (!state.planDraft) state.planDraft = (state.money.pots || []).map(x => ({ ...x })); return state.planDraft; }
  $("#planRows").addEventListener("input", e => {
    const t = e.target, m = t.id.match(/^(pn|pv|pm|pk|ps)-(.+)$/); if (!m) return;
    const [, f, id] = m;
    if (f === "ps") {
      const cur = { ...spendFor(state.moneyKey) }; if (t.value === "") delete cur[id]; else cur[id] = Number(t.value);
      state.spend.set(state.moneyKey, cur); updatePlanNumbers();
      clearTimeout(spendTimer); const k = state.moneyKey;
      spendTimer = setTimeout(async () => { if (!state.db) return; try { await S.spend().doc(k).set({ ...state.spend.get(k) }); } catch (e2) { toast("Spending didn't save"); } }, 800);
      return;
    }
    const pt = draft().find(x => x.id === id); if (!pt) return;
    if (f === "pn") pt.name = t.value; if (f === "pv") pt.value = t.value === "" ? 0 : Number(t.value);
    if (f === "pm") pt.mode = t.value; if (f === "pk") { pt.kind = t.value; t.closest(".pot").className = "pot kind-" + t.value; }
    updatePlanNumbers();
  });
  $("#planRows").addEventListener("change", e => { if (/^p[mk]-/.test(e.target.id)) e.target.dispatchEvent(new Event("input", { bubbles: true })); });
  $("#planRows").addEventListener("click", e => {
    const b = e.target.closest(".pdel"); if (!b) return;
    const id = b.closest(".pot").dataset.id; state.planDraft = draft().filter(x => x.id !== id);
    buildPlanRows(); updatePlanNumbers();
  });
  $("#addPot").onclick = () => {
    const id = "p" + Date.now().toString(36);
    draft().push({ id, name: "New pot", mode: "fixed", value: 0, kind: "want" });
    buildPlanRows(); updatePlanNumbers(); document.getElementById("pn-" + id)?.select();
  };
  // Scale the % pots so % pots + fixed pots = take-home exactly; fixed pots are left alone
  $("#fitPlan").onclick = () => {
    const net = state.moneyNet || 0, d = draft();
    const fixed = d.filter(x => x.mode === "fixed").reduce((a, x) => a + (Number(x.value) || 0), 0);
    const pct = d.filter(x => x.mode !== "fixed");
    const sum = pct.reduce((a, x) => a + (Number(x.value) || 0), 0);
    if (!net || !sum) return;
    if (fixed > net) { toast("Your fixed pots alone are more than your take-home"); return; }
    const target = ((net - fixed) / net) * 100;
    pct.forEach(x => { x.value = Math.round(((Number(x.value) || 0) * target / sum) * 10) / 10; });
    const biggest = pct.reduce((a, x) => (x.value > a.value ? x : a), pct[0]);
    biggest.value = Math.round((biggest.value + target - pct.reduce((a, x) => a + x.value, 0)) * 10) / 10;
    buildPlanRows(); updatePlanNumbers();
    toast("Plan fitted to your take-home. Check it, then tap Save plan");
  };
  $("#savePlan").onclick = async () => {
    if (!state.planDraft) return;
    if (!state.db) { toast("Your plan can't be saved in this view"); return; }
    const clean = state.planDraft.map(x => ({ id: x.id, name: String(x.name || "Pot").trim() || "Pot", mode: x.mode === "fixed" ? "fixed" : "pct", value: Number(x.value) || 0, kind: x.kind || "need" }));
    try { await S.money().set({ ...state.money, pots: clean }); state.planDraft = null; state.builtKey = ""; toast("Spending plan saved"); }
    catch (e) { toast("Your plan didn't save. Try again."); }
  };
  $("#taxForm").addEventListener("change", async () => {
    const next = { ...state.money, employment: $("#tEmp").value, taxCode: ($("#tCode").value || "1257L").toUpperCase().replace(/\s+/g, " ").trim(), pensionPct: Math.max(0, Number($("#tPension").value) || 0), studentLoan: $("#tLoan").value };
    state.money = next; render();
    if (state.db) { try { await S.money().set({ ...next, pots: next.pots || [] }); toast("Tax settings saved"); } catch (e) { toast("Tax settings didn't save"); } }
  });

  // ---------- first-time setup ----------
  let S = null;
  const STARTER_POTS = [
    { id: "rent", name: "Rent & bills", mode: "pct", value: 35, kind: "need" }, { id: "food", name: "Food & groceries", mode: "pct", value: 12, kind: "need" },
    { id: "transport", name: "Transport", mode: "pct", value: 8, kind: "need" }, { id: "phone", name: "Phone & subscriptions", mode: "pct", value: 3, kind: "need" },
    { id: "family", name: "Family & giving", mode: "pct", value: 10, kind: "need" }, { id: "savings", name: "Savings", mode: "pct", value: 15, kind: "save" },
    { id: "fun", name: "Personal & fun", mode: "pct", value: 10, kind: "want" }, { id: "buffer", name: "Buffer", mode: "pct", value: 7, kind: "want" }];
  function setupMode(on) {
    if (on && typeof obGo === "function" && !document.querySelector("#view-setup:not([hidden])")) obGo(OB_FIRST);
    document.querySelectorAll("section.view").forEach(v => { v.hidden = on ? v.id !== "view-setup" : v.id !== "view-" + state.view; });
    document.querySelectorAll(".tabs, .bottombar, .period").forEach(el => { el.hidden = on; });
  }
  // ---------- first-time setup: one question per screen ----------
  // ---------- profile: age group, sex, area, employer, community nickname ----------
  const NICK_A = ["NightOwl", "SleepIn", "EarlyBird", "KindHands", "TeaBreak", "LongShift", "CalmCarer", "SteadyHand", "QuietHero", "DayShift"];
  const nickFor = area => NICK_A[Math.floor(Math.random() * NICK_A.length)] + "_" + ((area || "").replace(/[^A-Za-z]/g, "").slice(0, 6) || String(Math.floor(10 + Math.random() * 89)));
  $("#uNickGen").onclick = () => { $("#uNick").value = nickFor(obVal("uArea")); obRender(); };
  $("#uSex").addEventListener("change", () => { $("#uSexOtherWrap").hidden = $("#uSex").value !== "other"; });
  ["uAge", "uSex", "uArea", "uEmployer", "uNick"].forEach(id => $("#" + id).addEventListener("input", () => { $("#setupErr").hidden = true; }));
  function profileCheck() {
    const err = m => { $("#setupErr").textContent = m; $("#setupErr").hidden = false; return false; };
    if (obStep === 2) { const a = $("#uAge").value; if (!a) return err("Choose your age group."); if (a === "under18") return err("Shiftbuck is for care workers aged 18 and over."); }
    if (obStep === 3) {
      if (!obVal("uArea")) return err("Add your town or county, for example Leicester.");
      const n = obVal("uNick"), first = obVal("uName").toLowerCase();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(n)) return err("Pick a nickname of 3 to 20 letters, numbers or _ with no spaces. Tap Suggest one for ideas.");
      if (first.length > 2 && n.toLowerCase().includes(first)) return err("Pick a nickname without your real name in it, so other carers can't tell who you are.");
    }
    return true;
  }
  const profileData = () => ({ ageGroup: $("#uAge").value, sex: $("#uSex").value || null, sexOther: $("#uSex").value === "other" ? obVal("uSexOther") || null : null,
    area: obVal("uArea"), employer: obVal("uEmployer") || null, nickname: obVal("uNick"), createdAt: new Date().toISOString() });
  const OB_LAST = 8, OB_FIRST = window.SBAuth ? 1 : 0;
  let obStep = 0, obDay = null, obType = "day";
  const obVal = id => $("#" + id).value.trim();
  const obPat = () => ({ dayStart: $("#obDayStart").value || "08:00", dayHours: Number($("#obDayHours").value) || 12, breakHrs: Math.max(0, Number($("#obBreak").value) || 0), sleepStart: $("#obSleepStart").value || "20:00", sleepEnd: $("#obSleepEnd").value || "08:00" });
  const obAdd = (hhmm, h) => { const [a, b] = hhmm.split(":").map(Number), m = ((a * 60 + b + Math.round(h * 60)) % 1440 + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  function obShiftPay() {
    const P = obPat(), rate = Number($("#uRate").value) || 0, sleep = Number($("#uSleep").value) || 0, paid = Math.max(0, P.dayHours - P.breakHrs);
    return obType === "day" ? paid * rate : obType === "sleep" ? sleep : obType === "both" ? paid * rate + sleep : 0;
  }
  function obRender() {
    document.querySelectorAll(".obstep").forEach(el => el.hidden = Number(el.dataset.step) !== obStep);
    $("#obTop").hidden = obStep === 0;
    $("#obBar").style.width = (obStep / OB_LAST * 100) + "%";
    $("#obCount").textContent = obStep ? `Step ${obStep} of ${OB_LAST}` : "";
    $("#obBack").hidden = obStep <= OB_FIRST;
    $("#obNext").hidden = obStep === OB_LAST; $("#setupBtn").hidden = obStep !== OB_LAST;
    $("#obNext").textContent = obStep === 0 ? "Get started" : obStep === 7 && !obVal("uUsers") ? "Skip" : "Next";
    const P = obPat(), paid = Math.max(0, P.dayHours - P.breakHrs);
    $("#obPatPrev").innerHTML = `Day <b>${P.dayStart}–${obAdd(P.dayStart, P.dayHours)}</b>, ${paid} paid hours · Sleep-in <b>${P.sleepStart}–${P.sleepEnd}</b>`;
    const lab = { day: ["Day", `${P.dayStart}–${obAdd(P.dayStart, P.dayHours)}`], sleep: ["Sleep-in", `${P.sleepStart}–${P.sleepEnd}`], both: ["Day + sleep-in", `${P.dayStart}–${P.sleepEnd}`] };
    $("#obTypes").querySelectorAll("[data-t]").forEach(b => { if (lab[b.dataset.t]) b.innerHTML = `${lab[b.dataset.t][0]}<small>${lab[b.dataset.t][1]}</small>`; b.setAttribute("aria-pressed", String(b.dataset.t === obType)); });
    $("#obPay").hidden = obType === "none"; $("#obPayV").textContent = gbp(obShiftPay());
    $("#setupBtn").textContent = obType === "none" ? "Start my Shiftbuck" : "Save and start";
    if (!$("#obDate").value) $("#obDate").value = todayStr;
    $("#setupErr").hidden = true;
  }
  function obCheck() {
    const err = m => { $("#setupErr").textContent = m; $("#setupErr").hidden = false; return false; };
    if (obStep === 1 && !obVal("uName")) return err("Add your first name.");
    if (!profileCheck()) return false;
    if (obStep === 4 && !(Number($("#uRate").value) > 0)) return err("Add your hourly rate, for example 13.00.");
    if (obStep === 4 && !(Number($("#uSleep").value || 0) >= 0)) return err("The sleep-in rate can't be below zero.");
    if (obStep === 5) { const d = Number($("#uDay").value); if (!(d >= 1 && d <= 28)) return err("Pick the day your pay month starts, from 1 to 28."); }
    if (obStep === 6) { const P = obPat(); if (!(P.dayHours > 0 && P.dayHours <= 24) || P.breakHrs >= P.dayHours) return err("Check the day shift hours and break."); }
    return true;
  }
  const obGo = n => { obStep = Math.max(OB_FIRST, Math.min(OB_LAST, n)); obRender(); const f = document.querySelector(`.obstep[data-step="${obStep}"] input`); if (f && obStep) setTimeout(() => f.focus({ preventScroll: true }), 50); window.scrollTo({ top: 0 }); };
  $("#obNext").onclick = () => { if (obCheck()) obGo(obStep + 1); };
  $("#obBack").onclick = () => obGo(obStep - 1);
  $("#setupForm").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT" && obStep < OB_LAST) { e.preventDefault(); $("#obNext").click(); } });
  $("#obDayChips").addEventListener("click", e => { const b = e.target.closest("[data-day]"); if (!b) return; $("#uDay").value = b.dataset.day; obSyncChips(); });
  const obSyncChips = () => $("#obDayChips").querySelectorAll("[data-day]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.day === $("#uDay").value)));
  $("#uDay").addEventListener("input", obSyncChips);
  $("#obTypes").addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (!b) return; obType = b.dataset.t; obRender(); });
  ["obDayStart", "obDayHours", "obBreak", "obSleepStart", "obSleepEnd", "uName", "uRole", "uRate", "uSleep", "uDay", "uUsers"].forEach(id => $("#" + id).addEventListener("input", obRender));
  $("#setupForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (obStep !== OB_LAST) { $("#obNext").click(); return; }
    const name = obVal("uName"), rate = Number($("#uRate").value), sleep = Number($("#uSleep").value) || 0, day = Number($("#uDay").value);
    if (!name || !(rate > 0) || !(day >= 1 && day <= 28)) { obGo(!name ? 1 : !(rate > 0) ? 4 : 5); obCheck(); return; }
    if (!$("#uAge").value || $("#uAge").value === "under18" || !obVal("uNick")) { obGo(!$("#uAge").value || $("#uAge").value === "under18" ? 2 : 3); obCheck(); return; }
    const P = obPat(), users = obVal("uUsers").split(",").map(x => x.trim()).filter(Boolean), pay = obShiftPay();
    $("#setupBtn").disabled = true; $("#setupErr").hidden = true;
    try {
      await S.money().set({ ...MONEY_DEFAULTS, pots: STARTER_POTS });
      await S.profile().set(profileData());
      const date = $("#obDate").value;
      if (obType !== "none" && date) {
        await S.shifts().doc(date).set({ date, users: [], sleepIn: obType !== "day", dayHours: obType === "sleep" ? null : P.dayHours, breakHrs: obType === "sleep" ? null : P.breakHrs, notes: "", updatedAt: new Date().toISOString() });
      }
      await S.main().set({ name, role: obVal("uRole") || "Support Worker", hourlyRate: rate, sleepInRate: sleep, periodStartDay: day, serviceUsers: users, pattern: P });
      state.view = obType === "none" ? "log" : "overview";
      toast(obType === "none" ? `Welcome, ${name}. Log your first shift when you're ready` : `Welcome, ${name}. Your first shift pays ${gbp(pay)}`);
    } catch (e2) {
      $("#setupErr").textContent = e2?.code === "invalid_argument" ? "Shiftbuck couldn't save. Sign out and back in, then try again." : "That didn't save. Check your connection and try again.";
      $("#setupErr").hidden = false;
    } finally { $("#setupBtn").disabled = false; }
  });



  // ---------- forecast ----------
  // Predicts the next 7 days from the last 8 weeks: how often each weekday was worked,
  // the most common shift type on that weekday, and the usual hours, break and service users.
  const FC_WEEKS = 8;
  const shiftKind = s => s.sleepIn && hasDayHrs(s) ? "Day + sleep-in" : s.sleepIn ? "Sleep-in" : "Day shift";
  const medianOf = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
  const modeOf = a => { const m = new Map(); a.forEach(x => m.set(x, (m.get(x) || 0) + 1)); let best = null, n = 0; m.forEach((v, k) => { if (v > n) { n = v; best = k; } }); return best; };
  function forecast() {
    const today = parse(todayStr);
    const past = [...state.shifts.values()].filter(s => s.date < todayStr && worked(s));
    if (!past.length) return { days: [], basis: 0, weeks: 0 };
    const first = parse(past.map(s => s.date).sort()[0]);
    const from = first > addDays(today, -7 * FC_WEEKS) ? first : addDays(today, -7 * FC_WEEKS);
    const inWin = past.filter(s => parse(s.date) >= from);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, i), key = ymd(d), wd = d.getDay();
      let seen = 0; for (let x = from; x < today; x = addDays(x, 1)) if (x.getDay() === wd) seen++;
      const hits = inWin.filter(s => parse(s.date).getDay() === wd);
      const p = seen ? hits.length / seen : 0, existing = state.shifts.get(key);
      let guess = null;
      if (hits.length) {
        const kind = modeOf(hits.map(shiftKind)), same = hits.filter(s => shiftKind(s) === kind), dayOnes = same.filter(hasDayHrs);
        guess = { date: key, users: (modeOf(same.map(s => (s.users || []).join("|"))) || "").split("|").filter(Boolean), sleepIn: kind !== "Day shift",
          dayHours: dayOnes.length ? medianOf(dayOnes.map(s => Number(s.dayHours))) : null, breakHrs: dayOnes.length ? medianOf(dayOnes.map(s => Number(s.breakHrs) || 0)) : null, notes: "" };
      }
      days.push({ d, key, p, existing, guess, pay: existing ? calc(existing).total : guess ? calc(guess).total : 0 });
    }
    return { days, basis: inWin.length, weeks: Math.max(1, Math.round((today - from) / 6048e5)) };
  }
  function renderForecast() {
    const f = forecast(), f0 = d => fmt(d, { weekday: "short", day: "numeric", month: "short" });
    if (!f.days.length) {
      $("#fcRange").textContent = "Next 7 days"; $("#fcPay").textContent = "–";
      $("#fcLegend").innerHTML = "<span>Log a few weeks of shifts and Shiftbuck will predict your next week.</span>";
      $("#fcList").innerHTML = ""; $("#fcBasis").textContent = ""; $("#fcRestText").textContent = ""; $("#fcRestPill").textContent = ""; return;
    }
    const likely = f.days.filter(x => x.existing || x.p >= 0.5);
    const expected = f.days.reduce((a, x) => a + (x.existing ? x.pay : x.p * x.pay), 0), ifLikely = likely.reduce((a, x) => a + x.pay, 0);
    const cur = summarise(periodFor(new Date(), 0)).t, keep = cur.gross ? deductions(cur.gross, state.money).net / cur.gross : 0.8;
    $("#fcRange").textContent = `Forecast pay · ${f0(f.days[0].d)} – ${f0(f.days[6].d)}`;
    $("#fcPay").textContent = gbp(expected);
    $("#fcLegend").innerHTML = `<span>Expected pay, weighted by how likely each shift is</span><span>If every likely shift happens <b>${gbp(ifLikely)}</b></span><span>About <b>${gbp(ifLikely * keep)}</b> take-home</span>`;
    $("#fcBasis").textContent = `From ${f.basis} shifts over the last ${f.weeks} week${f.weeks === 1 ? "" : "s"}`;
    $("#fcList").innerHTML = f.days.map(x => {
      const s = x.existing || x.guess, pct = Math.round(x.p * 100);
      const st = x.existing ? ["onrota", "On your rota"] : x.p >= 0.5 ? ["likely", `Likely · ${pct}%`] : x.p >= 0.3 ? ["maybe", `Possible · ${pct}%`] : ["off", `Likely day off · ${100 - pct}%`];
      const shown = !!x.existing || (!!x.guess && x.p >= 0.3);
      const det = shown && s ? `${shiftKind(s)}${hasDayHrs(s) ? ` · ${hrs(Number(s.dayHours))} hrs, ${hrs(Number(s.breakHrs) || 0)} break` : ""}${(s.users || []).length ? ` · ${esc(s.users.join(", "))}` : ""}` : "Rest day expected";
      const btn = !x.existing && x.guess && x.p >= 0.3 ? `<button type="button" class="btn secondary fcadd" data-fc="${x.key}">Add to rota</button>` : "";
      return `<div class="fcday ${st[0]}"><div class="fcdate"><b>${fmt(x.d, { weekday: "short" })}</b><span>${fmt(x.d, { day: "numeric", month: "short" })}</span></div><div class="fcbody"><span class="fcpill ${st[0]}">${st[1]}</span><div class="fcdet">${det}</div><div class="fcbar" aria-hidden="true"><i style="width:${x.existing ? 100 : pct}%"></i></div></div><div class="fcpay num">${shown ? gbp(x.pay) : "–"}${btn}</div></div>`;
    }).join("");
    const m = new Map(state.shifts); likely.forEach(x => { if (!x.existing && x.guess) m.set(x.key, x.guess); });
    const rs = f.days.map(x => ({ x, r: restDay(x.key, m) })), red = rs.filter(o => o.r.level === "red"), amber = rs.filter(o => o.r.level === "amber");
    const lvl = red.length ? "red" : amber.length ? "amber" : "ok", worst = red[0] || amber[0];
    $("#fcRestCard").className = "card restcard lvl-" + lvl; $("#fcRestPill").className = "rpill " + lvl;
    $("#fcRestPill").textContent = lvl === "red" ? "⚠ Not resting enough" : lvl === "amber" ? "Watch your rest" : "✓ Well rested";
    $("#fcRestText").innerHTML = worst ? `If the likely shifts happen: ${worst.r.reasons[0]} on ${f0(worst.x.d)}. Try to keep a full day off this week.` : "If the likely shifts happen, you'll still get regular days off.";
  }
  $("#fcList").addEventListener("click", e => {
    const b = e.target.closest(".fcadd"); if (!b) return;
    const x = forecast().days.find(y => y.key === b.dataset.fc); if (!x || !x.guess) return;
    openLog(x.key);
    state.form.users = new Set(x.guess.users); $("#fHours").value = x.guess.dayHours ?? ""; $("#fBreak").value = x.guess.breakHrs ?? "";
    setSleep(!!x.guess.sleepIn); renderUserChips(); preview();
    show("log"); toast("Predicted shift filled in. Check it, then tap Save shift");
  });
  // ---------- privacy and FAQ ----------
  let infoReturn = null;
  function openInfo(name) {
    infoReturn = state.needsSetup ? "setup" : state.view;
    document.querySelectorAll("section.view").forEach(v => { v.hidden = v.id !== "view-" + name; });
    document.querySelectorAll(".tabs, .bottombar, .period").forEach(el => { el.hidden = true; });
    window.scrollTo({ top: 0 });
  }
  function closeInfo() {
    ["privacy", "terms", "faq"].forEach(n => { $("#view-" + n).hidden = true; });
    document.querySelectorAll(".tabs, .bottombar, .period").forEach(el => { el.hidden = false; });
    if (state.needsSetup && typeof setupMode === "function") { setupMode(true); return; }
    show(infoReturn && infoReturn !== "setup" ? infoReturn : "overview");
  }
  document.addEventListener("click", e => {
    const o = e.target.closest("[data-info]"); if (o) { e.preventDefault(); openInfo(o.dataset.info); return; }
    if (e.target.closest("[data-info-back]")) closeInfo();
  });
  if ($("#delAll")) {
    $("#delAll").onclick = () => { $("#delAllConfirm").hidden = false; };
    $("#delAllNo").onclick = () => { $("#delAllConfirm").hidden = true; };
    $("#delAllYes").onclick = async () => {
      if (!S) { toast("Nothing to delete in this view"); return; }
      $("#delAllYes").disabled = true;
      try {
        const jobs = [];
        state.shifts.forEach((_, k) => jobs.push(S.shifts().doc(k).delete()));
        state.spend.forEach((_, k) => jobs.push(S.spend().doc(k).delete()));
        (state.payslips || new Map()).forEach((_, k) => jobs.push(payCol().doc(k).delete()));
        await Promise.all(jobs);
        await S.money().delete(); await S.main().delete();
        if (window.SBAuth) { try { await SBAuth.deleteAccount(); } catch (e3) {} toast("Your account has been deleted"); setTimeout(() => location.reload(), 1200); return; }
        $("#delAllConfirm").hidden = true; toast("All your Shiftbuck data has been deleted");
        closeInfo();
      } catch (e2) { toast("Some data wasn't deleted. Try again."); }
      finally { $("#delAllYes").disabled = false; }
    };
  }

  // ---------- community: carers talk under nicknames ----------
  // Store interface (Claude db here; Supabase or demo in the GitHub build via window.makeCommunityStore):
  //   start(onFeed)          onFeed({ posts:[{id, mine, nick, area, space, text, at, replyTo}], hidden:Set, reports:[...] })
  //   post({space, text, replyTo, nick, area})   remove(id)   report(id, reason)   hide(id) / unhide(id) for moderators
  const CM_SPACES = [["all", "Everything"], ["area", "Near me"], ["pay", "Pay & sleep-ins"], ["rights", "Your rights at work"], ["rest", "Rest & wellbeing"], ["meet", "Meet-ups"], ["general", "General chat"]];
  const CM_LABEL = Object.fromEntries(CM_SPACES);
  const cm = { store: null, feed: { posts: [], hidden: new Set(), reports: [], people: new Map(), team: { thread: [], unread: 0 }, announcements: [], inbox: [], dms: { threads: [], blocked: new Set() } }, space: "all", replyTo: null, reporting: null, uid: null, isMod: false, isTeam: false, thread: null, sheet: null, marking: "", dmReporting: null, lastBubbles: "" };
  const cmNorm = v => String(v || "").trim().toLowerCase();
  const cmAgo = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return "just now"; if (m < 60) return m + " min ago"; const h = Math.round(m / 60); if (h < 24) return h + " h ago"; const d = Math.round(h / 24); return d < 7 ? d + (d === 1 ? " day ago" : " days ago") : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
  const cmNickOk = (n, first) => /^[A-Za-z0-9_]{3,20}$/.test(n) && !(first && first.length > 2 && n.toLowerCase().includes(first.toLowerCase()));
  const cmNickFor = area => ["NightOwl", "SleepIn", "EarlyBird", "KindHands", "TeaBreak", "LongShift", "CalmCarer", "SteadyHand", "QuietHero", "DayShift"][Math.floor(Math.random() * 10)] + "_" + ((area || "").replace(/[^A-Za-z]/g, "").slice(0, 6) || String(Math.floor(10 + Math.random() * 89)));

  // Stops the most common ways a post could identify someone: postcodes, phone numbers,
  // emails, street addresses and the names of the people this carer supports.
  function cmCheck(text, opts = {}) {
    const t = String(text || "").trim();
    if (!t) return "Write something first.";
    if (opts.dm) {
      // private messages may carry the sender's own contact details, but never a postcode or the people they support
      if (/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(t)) return "Take out the postcode. Don't share where someone lives in a message.";
      const nm = (state.cfg.serviceUsers || []).map(n => String(n).trim()).filter(n => n.replace(/\./g, "").length >= 2);
      const h2 = nm.find(n => new RegExp("(^|[^A-Za-z])" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^A-Za-z]|$)", "i").test(t));
      return h2 ? `Take out "${h2}". Never name the people you support, even in a private message.` : null;
    }
    if (/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(t)) return "Take out the postcode. Posts can't include addresses.";
    if (/(\+44\s?|\b0)\d[\d\s-]{8,12}\d\b/.test(t)) return "Take out the phone number. Share contact details privately, not in a post.";
    if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(t)) return "Take out the email address.";
    if (/\b\d{1,4}[a-z]?\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)?\s+(Road|Rd|Street|St|Avenue|Ave|Close|Court|Ct|Lane|Ln|Drive|Dr|Grove|Way|Gate|Crescent|Place|Terrace|Gardens|Hill)\b/.test(t)) return "Take out the address. Never post where someone lives or works.";
    const names = (state.cfg.serviceUsers || []).map(n => String(n).trim()).filter(n => n.replace(/\./g, "").length >= 2);
    const hit = names.find(n => new RegExp("(^|[^A-Za-z])" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^A-Za-z]|$)", "i").test(t));
    if (hit) return `Take out "${hit}". Never name the people you support, even by first name or initials.`;
    return null;
  }

  // ---- Claude version of the store: one public doc per person at community/<id> holding their posts ----
  // Messages (Claude version): the team is everyone the owner gives edit access to.
  //   toTeam/<id>   {nick, area, msgs:[{id, text, at}]}   written by that carer, read by them and the team
  //   fromTeam/<id> {msgs:[{id, text, at}], teamSeenAt}   written by the team, read by that carer
  //   announce/all  {items:[{id, text, at}]}              written by the team, read by everyone
  //   data/users/<id>/inbox {teamSeenAt}                  private: when the carer last read the team's replies
  // Private carer-to-carer messages need the full app (Supabase), where only the two people can read them.
  const cmMsgId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function makeClaudeCommunityStore({ db, uid, isMod, isTeam, seenDoc }) {
    let mine = { nick: "", area: "", since: "", posts: [] }, mineExists = false, loaded = false, pendingProfile = null;
    let posts = [], people = new Map(), hidden = new Set(), reports = [], cb = () => {};
    let toTeam = [], fromTeam = [], teamSeen = "", ann = [], tTo = new Map(), tFrom = new Map();
    const byAt = (a, b) => a.at.localeCompare(b.at);
    const inbox = () => [...new Set([...tTo.keys(), ...tFrom.keys()])].filter(pid => pid !== uid || (tTo.get(pid) || {}).msgs?.length).map(pid => {
      const a = tTo.get(pid) || {}, b = tFrom.get(pid) || {}, seen = b.teamSeenAt || "";
      const thread = [...(a.msgs || []).map(m => ({ ...m, mine: false, who: a.nick || "Carer" })), ...(b.msgs || []).map(m => ({ ...m, mine: true, who: "Team" }))].sort(byAt);
      const pp = people.get(pid) || {};
      return { pid, nick: a.nick || pp.nick || "Carer", area: a.area || pp.area || "", thread, last: thread[thread.length - 1] || null, unread: (a.msgs || []).filter(m => m.at > seen).length, fromTeamDoc: b };
    }).filter(x => x.thread.length).sort((x, y) => (y.last?.at || "").localeCompare(x.last?.at || ""));
    const emit = () => {
      const thread = [...toTeam.map(m => ({ ...m, mine: true, who: "You" })), ...fromTeam.map(m => ({ ...m, mine: false, who: "Shiftbuck team" }))].sort(byAt);
      cb({ posts: posts.filter(p => isMod || !hidden.has(p.id) || p.mine), hidden, reports, people, canDM: false, isTeam,
        team: { thread, unread: fromTeam.filter(m => m.at > teamSeen).length }, announcements: ann, inbox: isTeam ? inbox() : [], dms: { threads: [], blocked: new Set() } });
    };
    const save = () => { mineExists = true; return db.doc("community/" + uid).set({ nick: mine.nick, area: mine.area, since: mine.since || new Date().toISOString(), posts: mine.posts.slice(-200), updatedAt: new Date().toISOString() }); };
    async function applyProfile(p) {
      if (!p || !p.nick) return;
      if (mineExists && mine.nick === p.nick && (mine.area || "") === (p.area || "")) return;
      mine.nick = p.nick; mine.area = p.area || ""; mine.since ||= new Date().toISOString();
      await save();
    }
    return {
      start(onFeed) {
        cb = onFeed;
        db.collection("community").limit(500).onSnapshot(snap => {
          posts = []; people = new Map();
          snap.docs.forEach(d => { const x = d.data() || {}; if (d.id === uid) { mine = { nick: x.nick || "", area: x.area || "", since: x.since || "", posts: x.posts || [] }; mineExists = true; }
            const ps = x.posts || [];
            if (x.nick) people.set(d.id, { nick: x.nick, area: x.area || "", since: x.since || (ps[0] && ps[0].at) || "", posts: ps.length, me: d.id === uid, dmOpen: false });
            ps.forEach(p => posts.push({ ...p, pid: d.id, nick: x.nick, area: x.area, mine: d.id === uid })); });
          posts.sort((a, b) => b.at.localeCompare(a.at));
          if (!loaded) { loaded = true; if (pendingProfile) applyProfile(pendingProfile).catch(() => {}); }
          emit();
        }, () => {});
        db.doc("toTeam/" + uid).onSnapshot(s => { toTeam = ((s.exists && s.data()) || {}).msgs || []; emit(); }, () => {});
        db.doc("fromTeam/" + uid).onSnapshot(s => { fromTeam = ((s.exists && s.data()) || {}).msgs || []; emit(); }, () => {});
        if (seenDoc) seenDoc.onSnapshot(s => { teamSeen = ((s.exists && s.data()) || {}).teamSeenAt || ""; emit(); }, () => {});
        db.doc("announce/all").onSnapshot(s => { ann = (((s.exists && s.data()) || {}).items || []).slice().sort((a, b) => b.at.localeCompare(a.at)); emit(); }, () => {});
        if (isTeam) {
          db.collection("toTeam").limit(1000).onSnapshot(snap => { tTo = new Map(snap.docs.map(d => [d.id, d.data() || {}])); emit(); }, () => {});
          db.collection("fromTeam").limit(1000).onSnapshot(snap => { tFrom = new Map(snap.docs.map(d => [d.id, d.data() || {}])); emit(); }, () => {});
        }
        db.doc("moderation/hidden").onSnapshot(s => { hidden = new Set(Object.keys((s.exists && s.data()) || {}).filter(k => (s.data() || {})[k])); emit(); }, () => {});
        if (isMod) db.collection("reports").limit(500).onSnapshot(snap => { reports = []; snap.docs.forEach(d => Object.entries(d.data() || {}).forEach(([id, r]) => reports.push({ id, ...r }))); emit(); }, () => {});
      },
      async post({ space, text, replyTo, nick, area }) {
        mine.nick = nick; mine.area = area;
        mine.posts = [...mine.posts, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), space, text, replyTo: replyTo || null, at: new Date().toISOString() }];
        await save();
      },
      async remove(id) { mine.posts = mine.posts.filter(p => p.id !== id && p.replyTo !== id); await save(); },
      async report(id, reason) {
        const ref = db.doc("reports/" + uid), cur = await ref.get();
        await ref.set({ ...((cur.exists && cur.data()) || {}), [id]: { reason, at: new Date().toISOString() } });
      },
      async hide(id) { await db.doc("moderation/hidden").set({ ...Object.fromEntries([...hidden].map(k => [k, true])), [id]: true }); },
      async unhide(id) { const h = Object.fromEntries([...hidden].filter(k => k !== id).map(k => [k, true])); await db.doc("moderation/hidden").set(h); },
      async syncProfile(p) { if (!loaded) { pendingProfile = p; return; } await applyProfile(p); },
      async sendToTeam(text, me) {
        await db.doc("toTeam/" + uid).set({ nick: me.nick || "", area: me.area || "", msgs: [...toTeam, { id: cmMsgId(), text, at: new Date().toISOString() }].slice(-200), updatedAt: new Date().toISOString() });
      },
      async teamReply(pid, text) {
        const cur = tFrom.get(pid) || {}, now = new Date().toISOString();
        await db.doc("fromTeam/" + pid).set({ msgs: [...(cur.msgs || []), { id: cmMsgId(), text, at: now }].slice(-200), teamSeenAt: now, updatedAt: now });
      },
      async markRead(t) {
        const now = new Date().toISOString();
        if (t.kind === "team" && seenDoc) await seenDoc.set({ teamSeenAt: now });
        if (t.kind === "inbox") { const cur = tFrom.get(t.pid) || {}; await db.doc("fromTeam/" + t.pid).set({ msgs: cur.msgs || [], teamSeenAt: now, updatedAt: cur.updatedAt || now }); }
      },
      async announce(text) { await db.doc("announce/all").set({ items: [{ id: cmMsgId(), text, at: new Date().toISOString() }, ...ann].slice(0, 20) }); },
      async removeAnnouncement(id) { await db.doc("announce/all").set({ items: ann.filter(a => a.id !== id) }); }
    };
  }
  const makeCommunityStore = window.makeCommunityStore || makeClaudeCommunityStore;

  function cmMe() { const p = state.profile || {}; return { nick: p.nickname || "", area: p.area || "" }; }
  function renderCommunity() {
    if (!$("#view-community")) return;
    const me = cmMe(), joined = !!me.nick;
    $("#cmJoin").hidden = joined; $("#cmMain").hidden = !joined;
    const myPid = [...(cm.feed.people || new Map()).entries()].find(([, v]) => v.me)?.[0];
    $("#cmMe").innerHTML = joined ? `You're ${myPid ? `<button type="button" class="linkinline" data-prof="${esc(myPid)}">${esc(me.nick)}</button>` : esc(me.nick)}${me.area ? " · " + esc(me.area) : ""}` : "";
    if (!joined) { if (!$("#cmJoin").contains(document.activeElement)) { $("#cmArea").value ||= (state.profile && state.profile.area) || ""; } return; }
    const spaces = CM_SPACES.map(([k, l]) => [k, k === "area" ? (me.area ? `Near me · ${me.area}` : l) : l]);
    $("#cmSpaces").innerHTML = spaces.map(([k, l]) => `<button type="button" data-cs="${k}" aria-pressed="${k === cm.space}">${esc(l)}</button>`).join("");
    if (!$("#cmComposer").contains(document.activeElement)) {
      const cur = $("#cmSpace").value || (["all", "area"].includes(cm.space) ? "general" : cm.space);
      $("#cmSpace").innerHTML = CM_SPACES.filter(([k]) => !["all", "area"].includes(k)).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
      $("#cmSpace").value = cur;
    }
    const all = cm.feed.posts, top = all.filter(p => !p.replyTo);
    const inSpace = p => cm.space === "all" || (cm.space === "area" ? cmNorm(p.area) === cmNorm(me.area) : p.space === cm.space);
    const list = top.filter(inSpace);
    const card = (p, isReply) => {
      const replies = isReply ? [] : all.filter(r => r.replyTo === p.id).sort((a, b) => a.at.localeCompare(b.at));
      const hiddenNote = cm.feed.hidden.has(p.id) ? `<span class="cmtag" style="background:var(--bad-soft);color:var(--bad)">${p.mine ? "Hidden by a moderator" : "Hidden"}</span>` : "";
      const reporting = cm.reporting === p.id ? `<div class="cmreport"><b>Why are you reporting this?</b><div class="obchips">${[["person", "Names or describes someone"], ["details", "Contact or address details"], ["abuse", "Abusive or unkind"], ["spam", "Spam or selling"], ["other", "Something else"]].map(([k, l]) => `<button type="button" data-rep="${k}" data-id="${esc(p.id)}">${l}</button>`).join("")}</div><button type="button" class="linkinline" data-repcancel>Cancel</button></div>` : "";
      return `<article class="cmpost${p.mine ? " mine" : ""}">
        <div class="cmwho">${p.pid ? `<button type="button" class="cmnick" data-prof="${esc(p.pid)}">${esc(p.nick || "Carer")}</button>` : `<b>${esc(p.nick || "Carer")}</b>`}${p.area ? `<span>${esc(p.area)}</span>` : ""}<span>${cmAgo(p.at)}</span>${!isReply ? `<span class="cmtag">${esc(CM_LABEL[p.space] || "General chat")}</span>` : ""}${p.mine ? '<span class="cmtag">You</span>' : ""}${hiddenNote}</div>
        <div class="cmbody">${esc(p.text)}</div>
        <div class="cmacts">${!isReply ? `<button type="button" data-reply="${esc(p.id)}">Reply${replies.length ? ` · ${replies.length}` : ""}</button>` : ""}${p.mine ? `<button type="button" class="danger" data-del="${esc(p.id)}">Delete</button>` : `<button type="button" data-report="${esc(p.id)}">Report</button>`}${cm.isMod && !p.mine ? `<button type="button" class="danger" data-hide="${esc(p.id)}">${cm.feed.hidden.has(p.id) ? "Unhide" : "Hide"}</button>` : ""}</div>
        ${reporting}
        ${replies.length ? `<div class="cmreplies">${replies.map(r => card(r, true)).join("")}</div>` : ""}
      </article>`;
    };
    $("#cmFeed").innerHTML = list.length ? list.map(p => card(p, false)).join("")
      : `<div class="cmempty">${cm.space === "all" ? "No posts yet. Be the first to say hello." : cm.space === "area" ? `No posts from ${esc(me.area || "your area")} yet.` : `Nothing in ${esc(CM_LABEL[cm.space])} yet. Start the conversation.`}</div>`;
    $("#cmMod").hidden = !cm.isMod;
    if (cm.isMod) {
      const byId = Object.fromEntries(all.map(p => [p.id, p])), seen = {};
      cm.feed.reports.forEach(r => { (seen[r.id] = seen[r.id] || []).push(r.reason); });
      const ids = Object.keys(seen);
      const dmr = (cm.feed.dmReports || []).map(r => `<div class="cmpost"><div class="cmwho"><b>Private message from ${esc(r.nick || "a carer")}</b><span>${r.count} report${r.count === 1 ? "" : "s"}: ${esc(r.reason)}</span></div><div class="cmbody">${esc(r.text)}</div><div class="cmacts"><button type="button" class="danger" data-restrict="${esc(r.id)}">Stop them sending messages</button></div></div>`).join("");
      $("#cmModList").innerHTML = dmr + (ids.length ? ids.map(id => { const p = byId[id]; return p ? `<div class="cmpost"><div class="cmwho"><b>${esc(p.nick)}</b><span>${seen[id].length} report${seen[id].length === 1 ? "" : "s"}: ${esc([...new Set(seen[id])].join(", "))}</span></div><div class="cmbody">${esc(p.text)}</div><div class="cmacts"><button type="button" class="danger" data-hide="${esc(id)}">${cm.feed.hidden.has(id) ? "Unhide" : "Hide for everyone"}</button></div></div>` : ""; }).join("") : (dmr ? "" : `<div class="cmempty">No reports.</div>`));
    }
    const rp = cm.replyTo && all.find(p => p.id === cm.replyTo);
    $("#cmReplying").hidden = !rp; $("#cmSpaceWrap").hidden = !!rp;
    $("#cmReplyTxt").textContent = rp ? `Replying to ${rp.nick}` : "";
    $("#cmTextLbl").textContent = rp ? "Your reply" : "What's on your mind?";
    $("#cmPost").textContent = rp ? "Reply" : "Post";
    renderMessages(); renderSheet();
  }

  // ---------- messages: the Shiftbuck team, and (full app) other carers ----------
  const cmInitial = n => esc(String(n || "?").replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "?");
  function cmUnreadTotal(f = cm.feed) {
    return (f.team?.unread || 0) + (cm.isTeam ? (f.inbox || []).reduce((a, x) => a + (x.unread || 0), 0) : 0) + (f.dms?.threads || []).reduce((a, x) => a + (x.unread || 0), 0);
  }
  function cmBadge() { const n = cmUnreadTotal(); document.querySelectorAll('[data-view="community"]').forEach(b => { b.toggleAttribute("data-unread", n > 0); b.setAttribute("aria-label", n ? `Community, ${n} unread message${n === 1 ? "" : "s"}` : "Community"); }); }
  function cmThreadInfo(t, f = cm.feed) {
    if (!t) return null;
    if (t.kind === "team") return { name: "Shiftbuck team", sub: "Only you and the Shiftbuck team can read these messages.", msgs: f.team?.thread || [], unread: f.team?.unread || 0 };
    const pp = (f.people && f.people.get(t.pid)) || {};
    if (t.kind === "inbox") {
      const x = (f.inbox || []).find(i => i.pid === t.pid) || {};
      const msgs = x.thread || (f.open && f.open.key === "inbox:" + t.pid ? f.open.msgs : null);
      return { name: x.nick || pp.nick || "Carer", sub: `${x.area || pp.area ? esc(x.area || pp.area) + " · " : ""}Writing to the Shiftbuck team. Your replies show as "Shiftbuck team".`, msgs, unread: x.unread || 0 };
    }
    const x = (f.dms?.threads || []).find(i => i.pid === t.pid) || {};
    const msgs = f.open && f.open.key === "dm:" + t.pid ? f.open.msgs : null;
    return { name: x.nick || pp.nick || "Carer", sub: `${x.area || pp.area ? esc(x.area || pp.area) + " · " : ""}Private: only the two of you can read this.`, msgs, unread: x.unread || 0 };
  }
  function cmRow(key, av, name, sub, unread, team) {
    return `<button type="button" class="cmrow" data-open="${esc(key)}"><span class="av${team ? " team" : ""}" aria-hidden="true">${av}</span><span class="tx"><b>${esc(name)}</b><span>${esc(sub)}</span></span>${unread ? `<span class="badge" aria-label="${unread} unread">${unread}</span>` : ""}</button>`;
  }
  // GitHub build without Supabase: everything is kept in this browser only
  const cmDemo = () => !!(window.SBAuth && window.SBAuth.mode !== "supabase");
  const cmLast = l => l ? (l.mine ? "You: " : "") + l.text : "";
  function renderMessages() {
    const f = cm.feed, t = cm.thread;
    cmBadge();
    const ann = f.announcements || [];
    $("#cmAnn").hidden = !ann.length;
    $("#cmAnnList").innerHTML = ann.slice(0, 3).map(a => `<div class="cmannitem"><div class="cmbody">${esc(a.text)}</div><div class="cmwho"><span>${cmAgo(a.at)}</span>${cm.isTeam ? `<button type="button" class="linkinline" data-unann="${esc(a.id)}">Remove</button>` : ""}</div></div>`).join("");
    $("#cmAnnForm").hidden = !(cm.isTeam && !t);
    $("#cmMsgHome").hidden = !!t; $("#cmThread").hidden = !t;
    const total = cmUnreadTotal(f);
    $("#cmMsgHint").textContent = total ? `${total} unread` : "";
    if (!t) {
      const team = f.team || { thread: [] }, lastT = team.thread[team.thread.length - 1];
      let h = cmRow("team", "S", "Shiftbuck team", lastT ? cmLast(lastT) : "Questions, problems or ideas? Message us.", team.unread, true);
      if (cm.isTeam) {
        h += `<div class="cmsect">Carers writing to the team</div>`;
        h += (f.inbox || []).length ? f.inbox.map(x => cmRow("inbox:" + x.pid, cmInitial(x.nick), x.nick || "Carer", cmLast(x.last) || x.area || "", x.unread)).join("") : `<div class="cmempty">No messages from carers yet.</div>`;
      }
      if (f.canDM) {
        h += `<div class="cmsect">Carers</div>`;
        h += (f.dms?.threads || []).length ? f.dms.threads.map(x => cmRow("dm:" + x.pid, cmInitial(x.nick), x.nick || "Carer", cmLast(x.last), x.unread)).join("") : `<p class="hint" style="margin:0">To message a carer, tap their nickname on a post.</p>`;
      } else {
        h += `<p class="hint" style="margin:10px 0 0">${cmDemo() ? "Demo mode: the community and messages only live in this browser, so there's nobody else here yet. Connect Shiftbuck to Supabase (see the README) and carers can post to each other and send private messages." : "Private messages between carers come with the full Shiftbuck app, where only the two people talking can read them. Until then, reply to each other's posts."}</p>`;
      }
      $("#cmMsgList").innerHTML = h; cm.lastBubbles = "";
      return;
    }
    const info = cmThreadInfo(t, f);
    $("#cmThreadName").textContent = info.name;
    const blocked = t.kind === "dm" && f.dms?.blocked?.has(t.pid);
    $("#cmThreadSub").innerHTML = blocked ? "You've blocked this carer. Unblock them to message again." : info.sub;
    $("#cmThreadActs").innerHTML = t.kind === "dm" ? `<button type="button" data-prof="${esc(t.pid)}">Profile</button><button type="button" class="danger" data-${blocked ? "unblock" : "block"}="${esc(t.pid)}">${blocked ? "Unblock" : "Block"}</button>` : "";
    $("#cmMsgForm").hidden = !!blocked;
    $("#cmMsgLbl").textContent = t.kind === "inbox" ? "Reply as the Shiftbuck team" : t.kind === "team" ? "Message the Shiftbuck team" : `Message ${info.name}`;
    const reasons = [["unwanted", "Unwanted or creepy"], ["abuse", "Abusive or threatening"], ["details", "Asks for personal details or money"], ["spam", "Spam or selling"], ["other", "Something else"]];
    const html = info.msgs == null ? `<div class="cmempty">Loading…</div>` : info.msgs.length ? info.msgs.map(m => `<div class="cmbub${m.mine ? " mine" : ""}"><span class="who">${esc(m.who)}</span><span class="txt">${esc(m.text)}</span><span class="when">${cmAgo(m.at)}</span>${t.kind === "dm" && !m.mine ? (cm.dmReporting === m.id ? `<div class="cmreport"><b>Why are you reporting this?</b><div class="obchips">${reasons.map(([k, l]) => `<button type="button" data-dmrep="${k}" data-id="${esc(m.id)}">${l}</button>`).join("")}</div><button type="button" class="linkinline" data-dmrepcancel>Cancel</button></div>` : `<button type="button" class="linkinline" data-dmreport="${esc(m.id)}">Report</button>`) : ""}</div>`).join("")
      : `<div class="cmempty">${t.kind === "team" ? "Tell us what's working, what isn't, or ask anything about Shiftbuck." : "No messages yet. Say hello."}</div>`;
    if (html !== cm.lastBubbles) { $("#cmBubbles").innerHTML = html; cm.lastBubbles = html; $("#cmBubbles").scrollTop = $("#cmBubbles").scrollHeight; }
    const key = t.kind + ":" + (t.pid || "");
    if (info.unread && cm.marking !== key && cm.store?.markRead) { cm.marking = key; cm.store.markRead(t).catch(() => {}).finally(() => { setTimeout(() => { if (cm.marking === key) cm.marking = ""; }, 1500); }); }
  }
  function cmOpen(t) {
    cm.thread = t; cm.lastBubbles = ""; cm.dmReporting = null; cm.sheet = null;
    $("#cmMsgErr").hidden = true; $("#cmMsgText").value = "";
    if (cm.store?.openThread) cm.store.openThread(t).catch(() => {});
    renderCommunity(); $("#cmMsgs").scrollIntoView({ block: "start", behavior: "smooth" });
  }
  function renderSheet() {
    const pid = cm.sheet, box = $("#cmSheet");
    if (!pid) { box.hidden = true; return; }
    const f = cm.feed, p = (f.people && f.people.get(pid)) || {};
    const fromPosts = f.posts.filter(x => x.pid === pid);
    const nick = p.nick || fromPosts[0]?.nick || "Carer", area = p.area || fromPosts[0]?.area || "";
    $("#cmSheetNick").textContent = nick;
    $("#cmSheetArea").textContent = area ? `Carer · ${area}` : "Carer";
    const since = p.since ? new Date(p.since).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "";
    $("#cmSheetStats").innerHTML = `${since ? `<span>Joined <b>${esc(since)}</b></span>` : ""}<span><b>${p.posts ?? fromPosts.length}</b> post${(p.posts ?? fromPosts.length) === 1 ? "" : "s"}</span>`;
    const blocked = f.dms?.blocked?.has(pid);
    let note = "", acts = "";
    if (p.me) {
      note = "This is you. Other carers only see your nickname and area.";
      if (f.canDM) acts = `<button type="button" class="btn secondary" data-dmopen="${p.dmOpen ? "off" : "on"}">${p.dmOpen ? "Stop new messages from carers" : "Let carers message me"}</button>`;
    } else if (!f.canDM) {
      note = cmDemo() ? "In demo mode there are no other carers to message. Connect Supabase to turn on private messages." : "Private messages between carers come with the full Shiftbuck app. For now, reply to their posts.";
    } else if (blocked) {
      note = "You've blocked this carer. They can't message you.";
      acts = `<button type="button" class="btn secondary" data-unblock="${esc(pid)}">Unblock</button>`;
    } else {
      note = p.dmOpen === false ? "This carer isn't taking new messages right now." : "Only the two of you can read private messages. Never share where you or the people you support live.";
      acts = (p.dmOpen === false ? "" : `<button type="button" class="btn" data-msg="${esc(pid)}">Message</button>`) + `<button type="button" class="btn danger" data-block="${esc(pid)}">Block</button>`;
    }
    $("#cmSheetNote").textContent = note; $("#cmSheetActs").innerHTML = acts;
    const wasHidden = box.hidden; box.hidden = false;
    if (wasHidden) $("#cmSheetClose").focus();
  }
  function cmCloseSheet() { const pid = cm.sheet; cm.sheet = null; renderSheet(); const back = pid && document.querySelector(`#cmFeed [data-prof="${CSS.escape(pid)}"]`); if (back) back.focus(); }
  $("#cmSheetClose").onclick = cmCloseSheet;
  $("#cmMe").addEventListener("click", e => { const b = e.target.closest("[data-prof]"); if (b) { cm.sheet = b.dataset.prof; renderSheet(); } });
  $("#cmSheet").addEventListener("click", e => { if (e.target === $("#cmSheet")) cmCloseSheet(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && cm.sheet) cmCloseSheet(); });
  $("#cmThreadBack").onclick = () => { cm.thread = null; cm.dmReporting = null; if (cm.store?.closeThread) cm.store.closeThread(); renderCommunity(); };
  $("#cmMsgText").addEventListener("input", () => { $("#cmMsgErr").hidden = true; });
  $("#cmMsgForm").addEventListener("submit", async e => {
    e.preventDefault(); const t = cm.thread; if (!t || !cm.store) return;
    const text = $("#cmMsgText").value.trim(), problem = cmCheck(text, { dm: true });
    const err = m => { $("#cmMsgErr").textContent = m; $("#cmMsgErr").hidden = false; };
    if (problem) return err(problem);
    $("#cmMsgSend").disabled = true;
    try {
      if (t.kind === "team") await cm.store.sendToTeam(text, cmMe());
      else if (t.kind === "inbox") await cm.store.teamReply(t.pid, text);
      else await cm.store.dmSend(t.pid, text);
      $("#cmMsgText").value = ""; toast("Message sent");
    } catch (e2) { err(t.kind === "dm" ? "That didn't send. This carer may not be taking messages, or you've sent a lot in the last hour." : t.kind === "inbox" ? "That didn't send. Only the Shiftbuck team can reply here." : "That didn't send. Check your connection and try again."); }
    finally { $("#cmMsgSend").disabled = false; }
  });
  $("#cmAnnForm").addEventListener("submit", async e => {
    e.preventDefault(); const text = $("#cmAnnText").value.trim(); if (!text || !cm.store?.announce) return;
    try { await cm.store.announce(text); $("#cmAnnText").value = ""; toast("Sent to everyone"); } catch (e2) { toast("Only the Shiftbuck team can send announcements."); }
  });
  $("#cmSpaces").addEventListener("click", e => { const b = e.target.closest("[data-cs]"); if (!b) return; cm.space = b.dataset.cs; if (!["all", "area"].includes(cm.space)) $("#cmSpace").value = cm.space; renderCommunity(); });
  $("#cmText").addEventListener("input", () => { $("#cmCount").textContent = `${$("#cmText").value.length} / 1000`; $("#cmErr").hidden = true; });
  $("#cmReplyCancel").onclick = () => { cm.replyTo = null; renderCommunity(); };
  $("#cmNickGen").onclick = () => { $("#cmNick").value = cmNickFor($("#cmArea").value); };
  $("#cmForm").addEventListener("submit", async e => {
    e.preventDefault(); if (!cm.store) { toast("The community isn't available in this view"); return; }
    const text = $("#cmText").value.trim(), problem = cmCheck(text);
    if (problem) { $("#cmErr").textContent = problem; $("#cmErr").hidden = false; return; }
    const me = cmMe(), parent = cm.replyTo && cm.feed.posts.find(p => p.id === cm.replyTo);
    $("#cmPost").disabled = true;
    try { await cm.store.post({ space: parent ? parent.space : $("#cmSpace").value, text, replyTo: parent ? parent.id : null, nick: me.nick, area: me.area }); $("#cmText").value = ""; $("#cmCount").textContent = "0 / 1000"; cm.replyTo = null; toast(parent ? "Reply posted" : "Posted"); renderCommunity(); }
    catch (e2) { $("#cmErr").textContent = "That didn't post. Check your connection and try again."; $("#cmErr").hidden = false; }
    finally { $("#cmPost").disabled = false; }
  });
  $("#cmFeed").parentElement.addEventListener("click", async e => {
    const t = e.target.closest("button"); if (!t || !cm.store) return;
    const d = t.dataset;
    if (d.prof) { cm.sheet = d.prof; renderSheet(); return; }
    if (d.open) { const [k, pid] = d.open.split(":"); cmOpen(k === "team" ? { kind: "team" } : { kind: k, pid }); return; }
    if (d.msg) { cm.sheet = null; renderSheet(); cmOpen({ kind: "dm", pid: d.msg }); return; }
    if (d.block) { try { await cm.store.dmBlock(d.block); toast("Blocked. They can't message you."); } catch (e2) { toast("That didn't work. Try again."); } return; }
    if (d.unblock) { try { await cm.store.dmUnblock(d.unblock); toast("Unblocked"); } catch (e2) { toast("That didn't work. Try again."); } return; }
    if (d.dmopen) { try { await cm.store.setDmOpen(d.dmopen === "on"); toast(d.dmopen === "on" ? "Carers can message you" : "New messages from carers are off"); } catch (e2) { toast("That didn't save. Try again."); } return; }
    if (d.dmreport) { cm.dmReporting = d.dmreport; renderMessages(); return; }
    if ("dmrepcancel" in d) { cm.dmReporting = null; renderMessages(); return; }
    if (d.dmrep) { try { await cm.store.dmReport(d.id, d.dmrep); toast("Thanks. A moderator will look at it. You can also block them."); } catch (e2) { toast("That didn't send. Try again."); } cm.dmReporting = null; renderMessages(); return; }
    if (d.restrict) { try { await cm.store.dmRestrict(d.restrict); toast("They can no longer send private messages."); } catch (e2) { toast("Only moderators can do that."); } return; }
    if (d.unann) { try { await cm.store.removeAnnouncement(d.unann); toast("Announcement removed"); } catch (e2) { toast("Only the Shiftbuck team can do that."); } return; }
    if (t.dataset.reply) { cm.replyTo = t.dataset.reply; renderCommunity(); $("#cmComposer").scrollIntoView({ block: "center" }); $("#cmText").focus({ preventScroll: true }); return; }
    if (t.dataset.del) { try { await cm.store.remove(t.dataset.del); toast("Post deleted"); } catch (e2) { toast("That didn't delete. Try again."); } return; }
    if (t.dataset.report) { cm.reporting = t.dataset.report; renderCommunity(); return; }
    if ("repcancel" in t.dataset) { cm.reporting = null; renderCommunity(); return; }
    if (t.dataset.rep) { try { await cm.store.report(t.dataset.id, t.dataset.rep); toast("Thanks. A moderator will look at it."); } catch (e2) { toast("That didn't send. Try again."); } cm.reporting = null; renderCommunity(); return; }
    if (t.dataset.hide) { try { cm.feed.hidden.has(t.dataset.hide) ? await cm.store.unhide(t.dataset.hide) : await cm.store.hide(t.dataset.hide); } catch (e2) { toast("Only moderators can do that."); } return; }
  });
  $("#cmJoinForm").addEventListener("submit", async e => {
    e.preventDefault();
    const nick = $("#cmNick").value.trim(), area = $("#cmArea").value.trim(), age = $("#cmAge").value;
    const bad = m => { $("#cmJoinErr").textContent = m; $("#cmJoinErr").hidden = false; };
    if (!cmNickOk(nick, state.cfg.name)) return bad("Pick a nickname of 3 to 20 letters, numbers or _ with no spaces and without your real name. Tap Suggest one for ideas.");
    if (!area) return bad("Add your town or county, for example Leicester.");
    if (!age) return bad("Choose your age group.");
    if (age === "under18") return bad("The community is for care workers aged 18 and over.");
    if (!S || !S.profile) return bad("Sign in to join the community.");
    try { await S.profile().set({ ...(state.profile || {}), nickname: nick, area, ageGroup: age, createdAt: (state.profile && state.profile.createdAt) || new Date().toISOString() }); toast(`Welcome, ${nick}`); }
    catch (e2) { bad("That didn't save. Try again."); }
  });

  // ---------- boot ----------
  try { const v = localStorage.getItem("sb.view"); if (v && v !== "log") show(v); } catch (e) {}
  openLog(todayStr); fillSettings(); render();

  (async () => {
    if (!window.claude?.use) { setSync("bad", "Storage is unavailable in this browser"); state.loaded = true; render(); return; }
    const [db, user, dl] = await Promise.all([claude.use("db"), claude.use("user"), claude.use("downloads")]);
    state.db = db; state.mcp = null; state.downloads = dl;
    const uid = user ? await user.id() : null;
    if (!db || !uid) { setSync("bad", "Sign in to use Shiftbuck"); state.loaded = true; render(); return; }
    // every viewer's data lives in their own private subtree: data/users/<their id>/...
    const base = "data/users/" + uid;
    S = { profile: () => db.doc(base + "/profile"), main: () => db.doc(base + "/main"), money: () => db.doc(base + "/money"),
          shifts: () => db.doc(base + "/main").collection("shifts"), spend: () => db.doc(base + "/main").collection("spend") };
    setSync("ok", window.SBAuth && SBAuth.mode === "supabase" ? "Synced · private to you" : "Demo · saved in this browser");
    const cmSync = () => { const me = cmMe(); if (cm.store && cm.store.syncProfile && me.nick) cm.store.syncProfile(me).catch(() => {}); };
    S.profile().onSnapshot(snap => { state.profile = snap.exists ? snap.data() : null; cmSync(); renderCommunity(); }, () => {});
    try { cm.isMod = !!(user && user.isOwner && await user.isOwner()); } catch (e) { cm.isMod = false; }
    // the Shiftbuck team = people the owner gives edit access (the full app uses its moderators table instead)
    try { cm.isTeam = !window.SBAuth && !!(user && user.canEdit && await user.canEdit()); } catch (e) { cm.isTeam = false; }
    cm.uid = uid; cm.store = makeCommunityStore({ db, uid, isMod: cm.isMod, isTeam: cm.isTeam, seenDoc: db.doc(base + "/inbox") });
    cm.store.start(f => { cm.feed = { people: new Map(), team: { thread: [], unread: 0 }, announcements: [], inbox: [], dms: { threads: [], blocked: new Set() }, ...f }; if (typeof f.isMod === "boolean") cm.isMod = f.isMod; if (typeof f.isTeam === "boolean") cm.isTeam = f.isTeam; if (state.view === "community") renderCommunity(); else cmBadge(); });
    cmSync();
    S.main().onSnapshot(snap => {
      state.needsSetup = !snap.exists; setupMode(state.needsSetup);
      state.cfg = { ...DEFAULTS, ...(snap.exists ? snap.data() : {}) }; fillSettings(); if (!state.editing || state.view !== "log") renderUserChips(); render();
    }, () => {});
    S.money().onSnapshot(snap => { state.money = { ...MONEY_DEFAULTS, ...(snap.exists ? snap.data() : {}) }; render(); }, () => {});
    payCol().limit(120).onSnapshot(snap => { state.payslips = new Map(snap.docs.map(d => [d.id, d.data()])); render(); }, () => {});
    S.spend().limit(200).onSnapshot(snap => {
      const typingSpend = /^ps-/.test(document.activeElement?.id || "");
      if (!typingSpend) { state.spend = new Map(snap.docs.map(d => [d.id, d.data()])); render(); }
    }, () => {});
    S.shifts().limit(1000).onSnapshot(snap => {
      state.shifts = new Map(snap.docs.map(d => [d.id, d.data()]));
      state.loaded = true; render();
    }, e => { setSync("bad", e?.code === "revoked" ? "Access to this Shiftbuck changed" : "Live updates stopped. Reload to reconnect"); });
  })();
})();
