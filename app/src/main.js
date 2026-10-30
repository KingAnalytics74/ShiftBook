/*
 * Shiftbook — personal shift log, pay and budget app.
 *
 * MULTI-USER EDITION: every path below lives under the viewer's private subtree data/users/<id>/
 * DATA MODEL (artifact db)
 *   main          {name, role, hourlyRate, sleepInRate, periodStartDay, serviceUsers[]}
 *   money         {employment: "paye"|"self", taxCode: "1257L"|"BR", pensionPct, studentLoan, pots[]}
 *                 pot = {id, name, mode: "pct"|"fixed", value, kind: "need"|"want"|"save"}
 *   main/shifts/<YYYY-MM-DD>  {date, users[], sleepIn, dayHours|null, breakHrs|null, notes, jotformId?, updatedAt}
 *   main/spend/<periodStart>  {<potId>: amountSpent, ...}
 *
 * PAY RULES   net hours = day hours − break; pay = net hours × hourlyRate + (sleepIn ? sleepInRate : 0)
 * PERIODS     run from periodStartDay of one month to the day before it next month
 * TAX         monthly estimate, 2026/27 rUK rates (see core/tax.js) — not a payslip
 * SYNC        none in this edition (no Jotform)
 */
import { deductions } from "./core/tax.js";
import { periodFor as periodForCore, daysIn } from "./core/periods.js";
import { calc as calcCore, summarise as summariseCore } from "./core/pay.js";

(() => {
  const DEFAULTS = { name: "", role: "Support Worker", hourlyRate: 13, sleepInRate: 40, periodStartDay: 26, serviceUsers: [] };
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
  const periodFor = (d, k = 0) => periodForCore(d, k, state.cfg.periodStartDay);
  const curPeriod = () => periodFor(new Date(), state.offset);

  // ---------- calc ----------
  const calc = s => calcCore(s, state.cfg, todayStr);
  const summarise = p => summariseCore(p, state.shifts, state.cfg, todayStr);


  let renderQueued = false;

  function scheduleRender() {
    if (renderQueued) return;

    renderQueued = true;

    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  // ---------- render ----------
  function render() {
    const p = curPeriod();
    const sm = summarise(p);
    $("#who").textContent = [state.cfg.name, state.cfg.role].filter(Boolean).join(" · ") || "Support Worker";
    $("#periodLabel").innerHTML = `${fmt(p.start, { day: "numeric", month: "short" })} – ${fmt(p.end, { day: "numeric", month: "short", year: "numeric" })}<small>${state.offset === 0 ? "Current pay period" : state.offset < 0 ? Math.abs(state.offset) + " period" + (state.offset < -1 ? "s" : "") + " ago" : "Upcoming"}</small>`;
    renderOverview(p, sm); renderSheet(p, sm); renderMoney(p, sm);
  }

  function renderOverview(p, sm) {
    const t = sm.t;
    $("#gross").textContent = gbp(t.gross);
    const dd = deductions(t.gross, state.money);
    $("#grossNet").innerHTML = `<span>Estimated take-home after tax, NI and pension <b>${gbp(dd.net)}</b></span><span>Unpaid breaks <b>${hrs(t.breaks)} hrs</b>, worth <b>${gbp(t.breaks * state.cfg.hourlyRate)}</b></span>`;
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
      <div class="preview" style="background:transparent;border:1px dashed var(--line)"><span>Unpaid breaks: ${hrs(t.breaks)} hrs × ${gbp(state.cfg.hourlyRate)} <span class="hint">(not paid)</span></span><span class="num" style="color:var(--muted)">${gbp(t.breaks * state.cfg.hourlyRate)}</span></div></div>`;
  }

  // ---------- views ----------
  function show(view) {
    if (state.needsSetup) return;
    state.view = view;
    ["overview", "log", "sheet", "money"].forEach(v => { $("#view-" + v).hidden = v !== view; });
    document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.view === view)));
    try { localStorage.setItem("sb.view", view); } catch (e) { }
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
  function setSleep(v) { state.form.sleep = v; $("#fSleep").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.v === "yes") === v))); preview(); }
  $("#fSleep").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setSleep(b.dataset.v === "yes"); });
  document.querySelectorAll("[data-h]").forEach(b => b.onclick = () => { $("#fHours").value = b.dataset.h; if (b.dataset.h === "12" && $("#fBreak").value === "") $("#fBreak").value = 2; preview(); });
  document.querySelectorAll("[data-b]").forEach(b => b.onclick = () => { $("#fBreak").value = b.dataset.b; preview(); });
  ["#fHours", "#fBreak"].forEach(s => $(s).addEventListener("input", preview));
  $("#fDate").addEventListener("change", () => { const v = $("#fDate").value; if (v) openLog(v); });

  function formShift() {
    const h = $("#fHours").value, b = $("#fBreak").value;
    return { date: $("#fDate").value, users: [...state.form.users], sleepIn: state.form.sleep, dayHours: h === "" ? null : Number(h), breakHrs: b === "" ? null : Number(b), notes: $("#fNotes").value.trim() };
  }
  function preview() {
    const f = formShift();
    $("#fPreview").textContent = gbp(calc(f).total);
    const bk = f.dayHours != null ? Number(f.breakHrs) || 0 : 0;
    $("#fBreakNote").hidden = !bk;
    if (bk) $("#fBreakNote").textContent = `Unpaid break: ${hrs(bk)} hrs, worth ${gbp(bk * state.cfg.hourlyRate)} at your rate.`;
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
      if (id && state.db) { try { await S.shifts().doc(s.date).update({ jotformId: id }); } catch (e) { } }
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
    if (!state.db) { $("#formError").textContent = "Saving isn't available in this view. Open Shiftbook signed in to Claude to log shifts."; $("#formError").hidden = false; return; }
    $("#saveBtn").disabled = true;
    const body = { ...s, updatedAt: new Date().toISOString() };
    try {
      await S.shifts().doc(s.date).set(body);
      const newOnes = s.users.filter(u => !(state.cfg.serviceUsers || []).includes(u));
      if (newOnes.length) { state.cfg.serviceUsers = [...(state.cfg.serviceUsers || []), ...newOnes]; try { await S.main().set({ ...state.cfg }); } catch (e) { } }
      toast(`Shift saved · ${gbp(calc(s).total)}`);
      state.editing = null; show("overview");
      syncJotform(s);
    } catch (e2) {
      $("#formError").textContent = e2?.code === "invalid_argument" ? "You can open Shiftbook but not save to it yet. Ask the person who shared it to invite you by email as an editor." : "The shift didn't save. Check your connection and try again.";
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
    const lines = [["Date", "Day", "Service user(s)", "Sleep-in", "Day hours", "Break", "Net hours", "Hourly pay", "Sleep-in pay", "Total", "Notes"].join(",")];
    sm.rows.forEach(r => { const s = r.s, c = r.c; lines.push([r.key, fmt(r.date, { weekday: "short" }), s ? `"${(s.users || []).join(", ")}"` : "Day off", s ? (s.sleepIn ? "Y" : "N") : "", s?.dayHours ?? "", s?.breakHrs ?? "", c ? c.net : "", c ? c.hourly.toFixed(2) : "", c ? c.sleep.toFixed(2) : "", c ? c.total.toFixed(2) : "", s?.notes ? `"${s.notes.replace(/"/g, '""')}"` : ""].join(",")); });
    lines.push(["TOTAL", "", "", sm.t.sleepIns, sm.t.dayHours, sm.t.breaks, sm.t.net, sm.t.hourly.toFixed(2), sm.t.sleep.toFixed(2), sm.t.gross.toFixed(2), ""].join(","));
    return { text: lines.join("\n"), name: `Timesheet_${ymd(p.start)}_to_${ymd(p.end)}.csv` };
  }
  $("#csvBtn").onclick = async () => {
    if (!state.downloads) { toast("Downloads aren't available in this view"); return; }
    const f = csv();
    try { await state.downloads.save({ filename: f.name, data: f.text }); } catch (e) { if (e?.code !== "cancelled") toast("The file wasn't saved"); }
  };
  // Full JSON backup: every shift, setting, plan and spending record (also the hand-off format for a future GitHub build)
  $("#backupBtn").onclick = async () => {
    if (!state.downloads) { toast("Downloads aren't available in this view"); return; }
    const data = {
      exportedAt: new Date().toISOString(), app: "Shiftbook", schemaVersion: 1, config: state.cfg, money: state.money,
      shifts: [...state.shifts.values()].sort((a, b) => a.date.localeCompare(b.date)), spend: Object.fromEntries(state.spend), payslips: Object.fromEntries(state.payslips)
    };
    try { await state.downloads.save({ filename: `Shiftbook_backup_${todayStr}.json`, data: JSON.stringify(data, null, 2) }); } catch (e) { if (e?.code !== "cancelled") toast("The backup wasn't saved"); }
  };
  $("#copyBtn").onclick = async () => {
    const p = curPeriod(), t = summarise(p).t;
    const txt = `Timesheet – ${state.cfg.name || ""} (${state.cfg.role})\nPay period: ${fmt(p.start, { day: "numeric", month: "short" })} – ${fmt(p.end, { day: "numeric", month: "short", year: "numeric" })}\nShifts: ${t.shifts}\nNet hours: ${hrs(t.net)} × ${gbp(state.cfg.hourlyRate)} = ${gbp(t.hourly)}\nSleep-ins: ${t.sleepIns} × ${gbp(state.cfg.sleepInRate)} = ${gbp(t.sleep)}\nGross pay: ${gbp(t.gross)}`;
    try { await navigator.clipboard.writeText(txt); toast("Summary copied"); } catch (e) { toast("Copy isn't available here"); }
  };

  // ---------- settings ----------
  function fillSettings() {
    $("#sName").value = state.cfg.name || ""; $("#sRole").value = state.cfg.role || "";
    $("#sRate").value = state.cfg.hourlyRate; $("#sSleep").value = state.cfg.sleepInRate;
    $("#sStart").value = state.cfg.periodStartDay; $("#sUsers").value = (state.cfg.serviceUsers || []).join(", ");
  }
  $("#setForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!state.db) { toast("Settings can't be saved in this view"); return; }
    const next = { name: $("#sName").value.trim(), role: $("#sRole").value.trim(), hourlyRate: Number($("#sRate").value) || 0, sleepInRate: Number($("#sSleep").value) || 0, periodStartDay: Math.min(28, Math.max(1, Number($("#sStart").value) || 1)), serviceUsers: $("#sUsers").value.split(",").map(x => x.trim()).filter(Boolean) };
    try { await S.main().set(next); toast("Settings saved"); } catch (e2) { toast("Settings didn't save"); }
  });

  $("#resetSetupBtn").addEventListener("click", async () => {
    if (!confirm("Reset your setup details? Your saved shifts will not be deleted.")) return;

    try {
      await S.main().delete();

      state.needsSetup = true;
      state.cfg = { ...DEFAULTS };
      setupMode(true);

      toast("Setup reset. You can enter your details again.");
    } catch (e) {
      toast("Could not reset setup. Please try again.");
    }
  });

  // ---------- money ----------
  const MONEY_DEFAULTS = { employment: "paye", taxCode: "1257L", pensionPct: 4, studentLoan: "none", pots: [] };
  const KIND = { need: "Needs", want: "Wants", save: "Savings" };
  state.money = { ...MONEY_DEFAULTS }; state.spend = new Map(); state.planDraft = null; state.builtKey = "";
  let spendTimer;

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
    const steps = [["Gross pay from your shifts", g, ""], [self ? "Income tax to set aside" : "Income tax", -d.tax, "minus"], [self ? "Class 4 NI to set aside" : "National Insurance", -d.ni, "minus"]];
    if (d.pension) steps.push([`Pension (${mc.pensionPct}%)`, -d.pension, "minus"]);
    if (d.sl) steps.push(["Student loan", -d.sl, "minus"]);
    steps.push(["Take-home", d.net, "total"]);
    $("#mSteps").innerHTML = steps.map(([l, v, c]) => `<div class="step ${c}"><span>${l}</span><span class="num">${v < 0 ? "−" + gbp(-v) : gbp(v)}</span></div>`).join("");
    if (document.activeElement?.closest?.("#taxForm") == null) {
      $("#tEmp").value = mc.employment; $("#tCode").value = mc.taxCode; $("#tPension").value = mc.pensionPct; $("#tLoan").value = mc.studentLoan;
    }
    $("#tCode").disabled = self;
    const key = state.moneyKey + "|" + JSON.stringify(pots()) + "|" + JSON.stringify(spendFor(state.moneyKey));
    const typing = $("#planRows").contains(document.activeElement);
    if (key !== state.builtKey && !typing) { buildPlanRows(); state.builtKey = key; }
    updatePlanNumbers();
    renderPayslip(p, sm);
  }

  // ---------- payslip check ----------
  // A payslip is stored against the Shiftbook pay period it covers (doc id = period start date).
  state.payslips = new Map(); state.payEditing = null;
  const payCol = () => S.main().collection("payslips");
  function renderPayslip(p, sm) {
    const key = ymd(p.start), ps = state.payslips.get(key), editing = state.payEditing === key;
    $("#payHint").textContent = `For work ${fmt(p.start, { day: "numeric", month: "short" })} – ${fmt(p.end, { day: "numeric", month: "short" })}`;
    $("#payForm").hidden = !editing; $("#payEdit").hidden = editing;
    $("#payEdit").textContent = ps ? "Edit this payslip" : "Add the payslip for this period";
    if (!ps) { $("#payBody").innerHTML = `<p class="hint" style="margin:0">No payslip saved for this period yet. When it arrives, add it here and Shiftbook checks it against your logged shifts and its own tax maths.</p>`; return; }
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
    let notes = bad.length ? `<div class="banner warn">On this payslip's gross, Shiftbook's ${bad.map(b => b[0].toLowerCase()).join(" and ")} ${bad.length > 1 ? "differ" : "differs"} from your payslip (${bad.map(([l, a, b]) => `${l}: payslip ${gbp(a)}, Shiftbook ${gbp(b)}`).join("; ")}).${bad.some(b => b[0] === "Pension") && ps.gross > 520 ? ` Your payslip pension works out at ${Math.round((ps.pension / (Math.min(ps.gross, 4189) - 520)) * 1000) / 10}% of qualifying earnings, so set "Pension you pay" to that.` : ""}</div>`
      : `<div class="banner ok">✓ Shiftbook's tax, NI and pension maths matches this payslip to within £1.</div>`;
    if (!app) notes += `<p class="hint" style="margin:8px 0 0">No shifts were logged in Shiftbook for this period, so only the deductions are checked.</p>`;
    else if (Math.abs(ps.gross - app.gross) >= 1) {
      const more = app.gross - ps.gross;
      notes += `<div class="banner ${more > 0 ? "bad" : "warn"}" style="margin-top:8px">${more > 0 ? `Your logged shifts come to <b>${gbp(more)}</b> more than this payslip.` : `This payslip is <b>${gbp(-more)}</b> more than your logged shifts. A shift may be missing from Shiftbook.`}${more > 0 && !(ps.sleepPay > 0) && sm.t.sleep > 0 ? ` The payslip shows no sleep-in pay, but you logged ${sm.t.sleepIns} sleep-ins worth ${gbp(sm.t.sleep)}. Ask payroll how sleep-ins are being paid.` : more > 0 ? " Check for hours that weren't paid." : ""}</div>`;
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
    const next = { ...state.money, employment: $("#tEmp").value, taxCode: $("#tCode").value, pensionPct: Math.max(0, Number($("#tPension").value) || 0), studentLoan: $("#tLoan").value };
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
    document.querySelectorAll("section.view").forEach(v => { v.hidden = on ? v.id !== "view-setup" : v.id !== "view-" + state.view; });
    document.querySelectorAll(".tabs, .bottombar, .period").forEach(el => { el.hidden = on; });
  }
  const setupFields = {
    uName: "Please enter your name.",
    uRole: "Please enter your role.",
    uRate: "Please enter a valid hourly rate greater than £0.",
    uSleep: "Please enter a valid sleep-in rate of £0 or more.",
    uDay: "Enter a whole number between 1 and 28."
  };

  function showFieldError(id, message) {
    const input = document.getElementById(id);
    const error = document.getElementById(id + "Err");

    error.textContent = message;
    error.hidden = !message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }


  $("#setupForm").addEventListener("submit", async e => {
    e.preventDefault();

    const name = $("#uName").value.trim();
    const rateText = $("#uRate").value.trim();
    const sleepText = $("#uSleep").value.trim();
    const dayText = $("#uDay").value.trim();

    const rate = Number(rateText);
    const sleep = Number(sleepText);
    const day = Number(dayText);

    const errors = [];

    if (!name) {
      errors.push("Please enter your name.");
    }

    if (!rateText) {
      errors.push("Please enter hourly rate.");
    } else if (!Number.isFinite(rate) || rate <= 0) {
      errors.push("Invalid hourly rate.");
    }

    if (!sleepText) {
      errors.push("Please enter sleep-in rate.");
    } else if (!Number.isFinite(sleep) || sleep < 0) {
      errors.push("Invalid sleep-in rate.");
    }

    if (!dayText) {
      errors.push("Please enter pay-period start day.");
    } else if (!Number.isInteger(day) || day < 1 || day > 28) {
      errors.push("Invalid pay-period start day. Enter a day from 1 to 28.");
    }

    if (errors.length) {
      $("#setupErr").innerHTML =
        "<ul>" + errors.map(error => `<li>${error}</li>`).join("") + "</ul>";
      $("#setupErr").hidden = false;
      return;
    }

    $("#setupErr").hidden = true;
    $("#setupBtn").disabled = true;

    try {
      await S.money().set({ ...MONEY_DEFAULTS, pots: STARTER_POTS });

      await S.main().set({
        name,
        role: $("#uRole").value.trim() || "Support Worker",
        hourlyRate: rate,
        sleepInRate: sleep,
        periodStartDay: day,
        serviceUsers: $("#uUsers").value
          .split(",").map(x => x.trim()).filter(Boolean)
      });

      state.view = "log";
      toast("Welcome to Shiftbook. Log your first shift");

    } catch (e2) {
      $("#setupErr").textContent =
        e2?.code === "invalid_argument"
          ? "Shiftbook can't save for you yet. Ask the person who shared it to invite you by email as an editor."
          : "That didn't save. Check your connection and try again.";

      $("#setupErr").hidden = false;

    } finally {
      $("#setupBtn").disabled = false;
    }
  });

  // ---------- standalone mode (e.g. GitHub Pages) ----------
  // Outside Claude there is no artifact db, so the same doc/collection API is backed by localStorage on this device.
  function localDb() {
    const KEY = "shiftbook.data.v1";
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
    let data = read(), queued = false;
    const subs = new Set();
    const emit = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; subs.forEach(f => f()); }); };
    const write = mut => { const next = { ...data }; mut(next); localStorage.setItem(KEY, JSON.stringify(next)); data = next; emit(); };
    addEventListener("storage", e => { if (e.key === KEY) { data = read(); emit(); } });
    const listen = f => { subs.add(f); f(); return () => subs.delete(f); };
    const col = cp => ({
      doc: id => doc(cp + "/" + id),
      limit: () => col(cp),
      onSnapshot: cb => listen(() => cb({ docs: Object.keys(data).filter(k => k.startsWith(cp + "/") && !k.slice(cp.length + 1).includes("/")).map(k => ({ id: k.slice(cp.length + 1), data: () => data[k] })) }))
    });
    const doc = p => ({
      set: async v => write(d => { d[p] = JSON.parse(JSON.stringify(v)); }),
      update: async v => write(d => { d[p] = { ...(d[p] || {}), ...JSON.parse(JSON.stringify(v)) }; }),
      delete: async () => write(d => { delete d[p]; }),
      collection: name => col(p + "/" + name),
      onSnapshot: cb => listen(() => cb({ exists: p in data, data: () => data[p] }))
    });
    return { doc };
  }
  const localDownloads = {
    save: async ({ filename, data }) => {
      const url = URL.createObjectURL(new Blob([data], { type: filename.endsWith(".csv") ? "text/csv" : "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  // Restore reads the file written by "Back up all data", so data can also move from the Claude version to this one
  $("#restoreBtn").onclick = () => $("#restoreFile").click();
  $("#restoreFile").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file || !S) return;
    try {
      const b = JSON.parse(await file.text());
      if (b.app !== "Shiftbook" || !b.config) throw new Error("not a backup");
      await S.money().set({ ...MONEY_DEFAULTS, ...(b.money || {}) });
      for (const s of b.shifts || []) if (s?.date) await S.shifts().doc(s.date).set(s);
      for (const [k, v] of Object.entries(b.spend || {})) await S.spend().doc(k).set(v);
      for (const [k, v] of Object.entries(b.payslips || {})) await payCol().doc(k).set(v);
      await S.main().set({ ...DEFAULTS, ...b.config });
      toast(`Restored ${(b.shifts || []).length} shifts`);
    } catch (e2) { toast("That file isn't a Shiftbook backup"); }
  });

  // ---------- boot ----------
  try { const v = localStorage.getItem("sb.view"); if (v && v !== "log") show(v); } catch (e) { }
  openLog(todayStr); fillSettings(); scheduleRender();

  (async () => {
    const local = !window.claude?.use;
    let ok = true; if (local) { try { localStorage.setItem("shiftbook.test", "1"); } catch (e) { ok = false; } }
    if (!ok) { setSync("bad", "This browser can't save. Turn off private browsing"); state.loaded = true; scheduleRender(); return; }
    const [db, user, dl] = local ? [localDb(), null, localDownloads] : await Promise.all([claude.use("db"), claude.use("user"), claude.use("downloads")]);
    state.db = db; state.mcp = null; state.downloads = dl;
    if (local) {
      $("#restoreBtn").hidden = false;
      $("#privNote").textContent = "Your shifts are saved in this browser on this device only. Use Back up all data on the Timesheet tab to keep a copy, and Restore from backup to move them to another device.";
    }
    const uid = local ? "me" : user ? await user.id() : null;
    if (!db || !uid) { setSync("bad", "Sign in to Claude to use Shiftbook"); state.loaded = true; scheduleRender(); return; }
    // every viewer's data lives in their own private subtree: data/users/<their id>/...
    const base = "data/users/" + uid;
    S = {
      main: () => db.doc(base + "/main"), money: () => db.doc(base + "/money"),
      shifts: () => db.doc(base + "/main").collection("shifts"), spend: () => db.doc(base + "/main").collection("spend")
    };
    setSync("ok", local ? "Saved on this device" : "Live · private to you");
    S.main().onSnapshot(snap => {
      state.needsSetup = !snap.exists; setupMode(state.needsSetup);
      state.cfg = { ...DEFAULTS, ...(snap.exists ? snap.data() : {}) }; fillSettings(); if (!state.editing || state.view !== "log") renderUserChips(); scheduleRender();
    }, () => { });
    S.money().onSnapshot(snap => { state.money = { ...MONEY_DEFAULTS, ...(snap.exists ? snap.data() : {}) }; scheduleRender(); }, () => { });
    payCol().limit(120).onSnapshot(snap => { state.payslips = new Map(snap.docs.map(d => [d.id, d.data()])); scheduleRender(); }, () => { });
    S.spend().limit(200).onSnapshot(snap => {
      const typingSpend = /^ps-/.test(document.activeElement?.id || "");
      if (!typingSpend) { state.spend = new Map(snap.docs.map(d => [d.id, d.data()])); scheduleRender(); }
    }, () => { });
    S.shifts().limit(1000).onSnapshot(snap => {
      state.shifts = new Map(snap.docs.map(d => [d.id, d.data()]));
      state.loaded = true; scheduleRender();
    }, e => { setSync("bad", e?.code === "revoked" ? "Access to this Shiftbook changed" : "Live updates stopped. Reload to reconnect"); });
  })();
})();