/* Date picker: every <input type="date"> becomes a tappable date that opens a calendar sheet, in the same style
   as the time picker. The real input stays in the page, hidden, as the value holder. Mouse, touch and keyboard work. */
import { dragSheet } from "./fluid.js";
const pad = n => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ""); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';
const CHEV = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const nice = p => new Date(p.y, p.m, p.d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const todayP = () => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }; };
let open = null, uid = 0;

function labelOf(inp) {
  const l = inp.closest("label") || (inp.id && document.querySelector(`label[for="${inp.id}"]`));
  if (!l) return "Date";
  const n = [...l.childNodes].find(x => x.nodeType === 3 && x.textContent.trim());
  return (n ? n.textContent : l.firstChild.textContent || "Date").trim() || "Date";
}

function openSheet(inp, trigger) {
  if (open) return;
  const sel = parse(inp.value), tod = todayP(), min = parse(inp.min), max = parse(inp.max);
  let vy = (sel || tod).y, vm = (sel || tod).m, focusD = sel ? sel.d : (tod.y === vy && tod.m === vm ? tod.d : 1), mode = "days";
  const title = labelOf(inp);
  const ov = document.createElement("div"); ov.className = "tpov";
  ov.innerHTML = `<div class="tpsheet dpsheet" role="dialog" aria-modal="true" aria-label="${title}, choose a date">
    <div class="tpgrab" aria-hidden="true"></div>
    <div class="tphead"><button type="button" class="tpcancel">Cancel</button><b>${title}</b><span></span></div>
    <div class="dpnav"><button type="button" class="dpstep" data-step="-1" aria-label="Previous month">${CHEV("M15 5l-7 7 7 7")}</button>
      <button type="button" class="dptitle" aria-live="polite"></button>
      <button type="button" class="dpstep" data-step="1" aria-label="Next month">${CHEV("M9 5l7 7-7 7")}</button></div>
    <div class="dpbody"></div>
    <div class="tpquick" role="group" aria-label="Quick picks"><button type="button" data-q="0">Today</button><button type="button" data-q="-1">Yesterday</button></div></div>`;
  document.body.append(ov); document.body.classList.add("tp-open");
  open = { ov };
  const body = ov.querySelector(".dpbody"), ttl = ov.querySelector(".dptitle");
  const inRange = (y, m, d) => { const k = iso(y, m, d); return !(min && k < iso(min.y, min.m, min.d)) && !(max && k > iso(max.y, max.m, max.d)); };

  function render(dir) {
    ttl.textContent = mode === "days" ? `${MONTHS[vm]} ${vy}` : String(vy);
    ttl.setAttribute("aria-label", mode === "days" ? `${MONTHS[vm]} ${vy}. Choose month and year` : `${vy}. Choose a month`);
    ov.querySelectorAll(".dpstep").forEach(b => b.setAttribute("aria-label", mode === "days" ? (b.dataset.step < 0 ? "Previous month" : "Next month") : (b.dataset.step < 0 ? "Previous year" : "Next year")));
    if (mode === "months") {
      body.innerHTML = `<div class="dpmonths">${MONTHS.map((n, i) => `<button type="button" data-mo="${i}" aria-pressed="${i === vm}">${n.slice(0, 3)}</button>`).join("")}</div>`;
    } else {
      const first = (new Date(vy, vm, 1).getDay() + 6) % 7, days = new Date(vy, vm + 1, 0).getDate();
      let h = `<div class="dpdow" aria-hidden="true">${DOW.map(d => `<span>${d}</span>`).join("")}</div><div class="dpgrid" role="grid">`;
      for (let i = 0; i < first; i++) h += "<span></span>";
      for (let d = 1; d <= days; d++) {
        const on = sel && sel.y === vy && sel.m === vm && sel.d === d, td = tod.y === vy && tod.m === vm && tod.d === d, ok = inRange(vy, vm, d);
        h += `<button type="button" class="dpd${on ? " on" : ""}${td ? " today" : ""}" data-d="${d}" tabindex="${d === focusD ? 0 : -1}" ${ok ? "" : "disabled"} aria-pressed="${on}" aria-label="${nice({ y: vy, m: vm, d })}${td ? ", today" : ""}">${d}</button>`;
      }
      body.innerHTML = h + "</div>";
    }
    if (dir && !reduce() && body.animate) body.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: "none" }], { duration: 320, easing: "cubic-bezier(.22,1,.36,1)" });
  }
  const goMonth = (n, dir) => { const t = new Date(vy, vm + n, 1); vy = t.getFullYear(); vm = t.getMonth(); focusD = Math.min(focusD, new Date(vy, vm + 1, 0).getDate()); render(dir || n); };
  const commit = p => {
    if (!inRange(p.y, p.m, p.d)) return;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set, v = iso(p.y, p.m, p.d);
    if (v !== inp.value) { set.call(inp, v); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); }
    sync(inp); close(); };
  const close = () => {
    if (!open) return; open = null; document.removeEventListener("keydown", onKey, true); ov.classList.add("out");
    const end = () => { ov.remove(); document.body.classList.remove("tp-open"); trigger.focus({ preventScroll: true }); };
    reduce() ? end() : setTimeout(end, 220);
  };
  const focusDay = () => { const b = body.querySelector(`.dpd[data-d="${focusD}"]`); if (b) b.focus({ preventScroll: true }); };
  const onKey = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "Tab") {
      const f = [...ov.querySelectorAll("button:not([disabled])")].filter(x => x.tabIndex >= 0 && x.offsetParent !== null); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (mode !== "days" || !document.activeElement.classList.contains("dpd")) return;
    const days = new Date(vy, vm + 1, 0).getDate(), k = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (k) { e.preventDefault(); const n = focusD + k; if (n < 1) { focusD = new Date(vy, vm, 0).getDate() + n; goMonth(-1); } else if (n > days) { focusD = n - days; goMonth(1); } else { focusD = n; body.querySelectorAll(".dpd").forEach(b => { b.tabIndex = +b.dataset.d === focusD ? 0 : -1; }); } focusDay(); }
    if (e.key === "PageDown") { e.preventDefault(); goMonth(e.shiftKey ? 12 : 1); focusDay(); }
    if (e.key === "PageUp") { e.preventDefault(); goMonth(e.shiftKey ? -12 : -1); focusDay(); }
    if (e.key === "Home") { e.preventDefault(); focusD = 1; goMonth(0, 0); focusDay(); }
    if (e.key === "End") { e.preventDefault(); focusD = days; goMonth(0, 0); focusDay(); }
  };
  document.addEventListener("keydown", onKey, true);
  dragSheet(ov.querySelector(".tpsheet"), [ov.querySelector(".tpgrab"), ov.querySelector(".tphead")], { dismiss: () => close(), scrim: null });
  ov.addEventListener("pointerdown", e => { if (e.target === ov) close(); });
  ov.querySelector(".tpcancel").onclick = close;
  ov.querySelectorAll(".dpstep").forEach(b => b.onclick = () => { if (mode === "months") { vy += +b.dataset.step; render(+b.dataset.step); } else goMonth(+b.dataset.step); });
  ttl.onclick = () => { mode = mode === "days" ? "months" : "days"; render(); if (mode === "days") focusDay(); };
  body.addEventListener("click", e => {
    const d = e.target.closest(".dpd"), mo = e.target.closest("[data-mo]");
    if (mo) { vm = +mo.dataset.mo; mode = "days"; focusD = Math.min(focusD, new Date(vy, vm + 1, 0).getDate()); render(); focusDay(); }
    if (d) { d.classList.add("on"); setTimeout(() => commit({ y: vy, m: vm, d: +d.dataset.d }), reduce() ? 0 : 140); }
  });
  ov.querySelector(".tpquick").addEventListener("click", e => { const b = e.target.closest("[data-q]"); if (!b) return; const t = new Date(); t.setDate(t.getDate() + Number(b.dataset.q)); commit({ y: t.getFullYear(), m: t.getMonth(), d: t.getDate() }); });
  render(0);
  requestAnimationFrame(() => { ov.classList.add("in"); focusDay(); });
}

function sync(inp) {
  const b = inp._dp; if (!b) return; const p = parse(inp.value);
  b.querySelector(".tv").textContent = p ? nice(p) : "Choose a date";
  b.setAttribute("aria-label", `${labelOf(inp)}: ${p ? nice(p) : "not set"}. Change date`);
}
function enhance(inp) {
  if (inp._dp || inp.type !== "date") return;
  const btn = document.createElement("button"); btn.type = "button"; btn.className = "tbtn dbtn"; btn.id = (inp.id || "dp" + ++uid) + "-dp";
  btn.setAttribute("aria-haspopup", "dialog"); btn.innerHTML = `${CAL}<span class="tv"></span>`; inp._dp = btn;
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  Object.defineProperty(inp, "value", { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); sync(this); } });
  inp.before(btn); inp.hidden = true;
  const lab = inp.id && document.querySelector(`label[for="${inp.id}"]`); if (lab) lab.htmlFor = btn.id;
  btn.addEventListener("click", () => openSheet(inp, btn));
  if (inp.form) inp.form.addEventListener("reset", () => setTimeout(() => sync(inp)));
  sync(inp);
}
function scan() { document.querySelectorAll('input[type="date"]').forEach(enhance); }
function start() { scan(); new MutationObserver(ms => { if (ms.some(m => m.addedNodes.length)) scan(); }).observe(document.body, { childList: true, subtree: true }); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
window.SBDate = { enhance, scan };
