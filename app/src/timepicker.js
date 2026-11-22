/* Time picker: every <input type="time"> becomes a box you can type a time into ("8", "2030", "8pm", "20:30"),
   with a clock button beside it that opens a sheet with spinning hour and minute wheels (the way iPhone clocks
   work). The real input stays in the page, hidden, as the value holder, so the code that reads and writes it
   doesn't change. Mouse, touch and keyboard all work. */
import { parseTimeText } from "./core/timeText.js";
const ITEM = 44, pad = n => String(n).padStart(2, "0");
const QUICK = ["06:00", "07:00", "08:00", "14:00", "20:00", "22:00"];
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
import { dragSheet } from "./fluid.js";
const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
let open = null, uid = 0;

function labelOf(inp) {
  const l = inp.closest("label") || (inp.id && document.querySelector(`label[for="${inp.id}"]`));
  if (!l) return "Time";
  const n = [...l.childNodes].find(x => x.nodeType === 3 && x.textContent.trim());
  return (n ? n.textContent : l.firstChild.textContent || "Time").trim() || "Time";
}

function wheel(values, labelTxt, ariaLabel) {
  const col = document.createElement("div");
  col.className = "tpcol"; col.tabIndex = 0; col.setAttribute("role", "listbox"); col.setAttribute("aria-label", ariaLabel);
  col.innerHTML = values.map(v => `<div class="tpi" role="option" data-v="${v}">${pad(v)}</div>`).join("");
  col.values = values; col.items = [...col.children];
  return col;
}
const indexOf = col => Math.max(0, Math.min(col.values.length - 1, Math.round(col.scrollTop / ITEM)));
function paint(col) {
  const pos = col.scrollTop / ITEM;
  col.items.forEach((el, i) => {
    const d = i - pos, a = Math.abs(d);
    if (a > 3.2) { el.style.transform = ""; el.style.opacity = "0"; return; }
    el.style.opacity = String(Math.max(0, 1 - a * 0.3));
    el.style.transform = `rotateX(${Math.max(-60, Math.min(60, -d * 22))}deg) scale(${1 - Math.min(a, 3) * 0.06})`;
    el.classList.toggle("on", a < 0.5);
  });
}
function setIndex(col, i, smooth) {
  const top = Math.max(0, Math.min(col.values.length - 1, i)) * ITEM;
  col.scrollTo({ top, behavior: smooth && !reduce() ? "smooth" : "instant" });
  if (!smooth) paint(col);
}

function openSheet(inp, trigger) {
  if (open) return;
  const cur = (inp.value || "08:00").split(":").map(Number), h0 = cur[0] || 0, m0 = cur[1] || 0;
  const mins = []; for (let m = 0; m < 60; m += 5) mins.push(m); if (!mins.includes(m0)) { mins.push(m0); mins.sort((a, b) => a - b); }
  const title = labelOf(inp);
  const ov = document.createElement("div");
  ov.className = "tpov";
  ov.innerHTML = `<div class="tpsheet" role="dialog" aria-modal="true" aria-label="${title}, choose a time">
    <div class="tpgrab" aria-hidden="true"></div>
    <div class="tphead"><button type="button" class="tpcancel">Cancel</button><b>${title}</b><span></span></div>
    <div class="tpbig" aria-live="polite"></div>
    <div class="tpwheels"><div class="tpband" aria-hidden="true"></div><div class="tpsep" aria-hidden="true">:</div></div>
    <div class="tpquick" role="group" aria-label="Quick picks"></div>
    <button type="button" class="btn tpdone">Done</button></div>`;
  const wheels = ov.querySelector(".tpwheels"), hh = wheel([...Array(24).keys()], "", "Hour"), mm = wheel(mins, "", "Minutes");
  wheels.insertBefore(hh, wheels.querySelector(".tpsep")); wheels.append(mm);
  const big = ov.querySelector(".tpbig"), quick = ov.querySelector(".tpquick"), done = ov.querySelector(".tpdone");
  const value = () => pad(hh.values[indexOf(hh)]) + ":" + pad(mm.values[indexOf(mm)]);
  quick.innerHTML = QUICK.map(q => `<button type="button" data-q="${q}">${q}</button>`).join("");
  document.body.append(ov); document.body.classList.add("tp-open");
  open = { ov, trigger };

  let last = "";
  const update = () => {
    const v = value(); big.textContent = v; done.textContent = "Set " + v;
    quick.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.q === v)));
    hh.items.forEach((el, i) => el.setAttribute("aria-selected", String(i === indexOf(hh)))); mm.items.forEach((el, i) => el.setAttribute("aria-selected", String(i === indexOf(mm))));
    if (v !== last) { if (last && navigator.vibrate) { try { navigator.vibrate(4); } catch (e) { } } last = v; }
  };
  [hh, mm].forEach(col => {
    let raf = 0;
    col.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { paint(col); update(); }); }, { passive: true });
    col.addEventListener("click", e => { const it = e.target.closest(".tpi"); if (it && !col.dragged) setIndex(col, col.items.indexOf(it), true); });
    col.addEventListener("keydown", e => {
      const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : e.key === "PageDown" ? 4 : e.key === "PageUp" ? -4 : 0;
      if (d) { e.preventDefault(); setIndex(col, indexOf(col) + d, true); }
      if (e.key === "Home") { e.preventDefault(); setIndex(col, 0, true); }
      if (e.key === "End") { e.preventDefault(); setIndex(col, col.values.length - 1, true); }
    });
    // a mouse can't flick a scroll area, so let it drag the wheel
    col.addEventListener("pointerdown", e => {
      if (e.pointerType !== "mouse" || e.button) return;
      const y0 = e.clientY, t0 = col.scrollTop; col.dragged = false; col.classList.add("drag"); col.setPointerCapture(e.pointerId);
      const mv = ev => { if (Math.abs(ev.clientY - y0) > 3) col.dragged = true; col.scrollTop = t0 - (ev.clientY - y0); };
      const up = () => { col.removeEventListener("pointermove", mv); col.removeEventListener("pointerup", up); col.classList.remove("drag"); setIndex(col, indexOf(col), true); setTimeout(() => { col.dragged = false; }, 0); };
      col.addEventListener("pointermove", mv); col.addEventListener("pointerup", up);
    });
  });
  const go = (h, m, smooth) => { setIndex(hh, h, smooth); setIndex(mm, mm.values.indexOf(m), smooth); };
  go(h0, m0, false); update();
  quick.addEventListener("click", e => { const b = e.target.closest("[data-q]"); if (!b) return; const [h, m] = b.dataset.q.split(":").map(Number); go(h, m, true); });

  const close = commit => {
    if (!open) return; open = null;
    if (commit) {
      const v = value(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      if (v !== inp.value) { set.call(inp, v); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); }
      sync(inp);
    }
    document.removeEventListener("keydown", onKey, true);
    ov.classList.add("out");
    const end = () => { ov.remove(); document.body.classList.remove("tp-open"); trigger.focus({ preventScroll: true }); };
    reduce() ? end() : setTimeout(end, 220);
  };
  const onKey = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(false); }
    if (e.key === "Enter" && !e.target.closest(".tpquick,.tpcancel")) { e.preventDefault(); close(true); }
    if (e.key === "Tab") {
      const f = [...ov.querySelectorAll("button,[tabindex='0']")].filter(x => x.offsetParent !== null); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener("keydown", onKey, true);
  dragSheet(ov.querySelector(".tpsheet"), [ov.querySelector(".tpgrab"), ov.querySelector(".tphead")], { dismiss: () => close(false), scrim: null });
  ov.addEventListener("pointerdown", e => { if (e.target === ov) close(false); });
  ov.querySelector(".tpcancel").onclick = () => close(false);
  done.onclick = () => close(true);
  requestAnimationFrame(() => { ov.classList.add("in"); hh.focus({ preventScroll: true }); });
}

function sync(inp) {
  const t = inp._tp; if (!t) return;
  const v = inp.value, name = labelOf(inp);
  if (document.activeElement !== t.text) t.text.value = v;
  t.text.setAttribute("aria-label", `${name}, type a time like 8:00 or 20:30`);
  t.clock.setAttribute("aria-label", `Choose ${name.toLowerCase()} on a clock. Now ${v || "not set"}`);
  clearBad(t);
}
function clearBad(t) { t.box.classList.remove("bad"); t.text.removeAttribute("aria-invalid"); if (t.err) t.err.hidden = true; }

const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
function commitText(inp) {
  const t = inp._tp, v = parseTimeText(t.text.value);
  if (v === null) {
    if (!t.err) {
      t.err = document.createElement("span"); t.err.className = "terr"; t.err.id = t.text.id + "-err"; t.err.setAttribute("role", "alert");
      t.box.after(t.err); t.text.setAttribute("aria-describedby", t.err.id);
    }
    t.err.textContent = "Can't read that time. Try 8:00, 20:30 or 8pm."; t.err.hidden = false;
    t.box.classList.add("bad"); t.text.setAttribute("aria-invalid", "true"); return false;
  }
  if (v !== inp.value) { nativeSet.call(inp, v); inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); }
  t.text.value = v; sync(inp); return true;
}

function enhance(inp) {
  if (inp._tp || inp.type !== "time") return;
  const id = inp.id || "tp" + ++uid;
  const box = document.createElement("span"); box.className = "tbox";
  const text = document.createElement("input");
  Object.assign(text, { type: "text", id: id + "-tp", className: "tvin", placeholder: "--:--", autocomplete: "off", maxLength: 8, spellcheck: false });
  text.setAttribute("inputmode", "numeric"); text.setAttribute("enterkeyhint", "done");
  const clock = document.createElement("button");
  clock.type = "button"; clock.className = "tclock"; clock.setAttribute("aria-haspopup", "dialog"); clock.innerHTML = CLOCK;
  box.append(text, clock);
  inp._tp = { box, text, clock };
  // programmatic writes to input.value (form fills, resets) keep the box in step
  const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  Object.defineProperty(inp, "value", { configurable: true, get() { return d.get.call(this); }, set(v) { d.set.call(this, v); sync(this); } });
  inp.before(box); inp.hidden = true;
  const lab = inp.id && document.querySelector(`label[for="${inp.id}"]`); if (lab) lab.htmlFor = text.id;
  // the text box has no name, so it isn't sent with the form and its own events stay out of the app's way
  ["input", "change"].forEach(ev => text.addEventListener(ev, e => e.stopPropagation()));
  text.addEventListener("input", () => clearBad(inp._tp));
  text.addEventListener("blur", () => commitText(inp));
  text.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault(); e.stopPropagation();   // don't let Enter submit the form or jump to the next step
    if (commitText(inp)) text.select();
  });
  clock.addEventListener("click", () => { commitText(inp); openSheet(inp, clock); });
  if (inp.form) inp.form.addEventListener("reset", () => setTimeout(() => sync(inp)));
  sync(inp);
}

function scan(root) { (root.querySelectorAll ? root : document).querySelectorAll('input[type="time"]').forEach(enhance); }
function start() {
  scan(document);
  new MutationObserver(ms => { if (ms.some(m => m.addedNodes.length)) scan(document); }).observe(document.body, { childList: true, subtree: true });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
window.SBTime = { enhance, scan };
