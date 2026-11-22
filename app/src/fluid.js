/* Fluid interaction helpers, after Apple's "Designing Fluid Interfaces" (WWDC 2018):
   - respond the instant a finger lands, follow it 1:1, and let anything be grabbed again mid-flight;
   - motion is a spring that starts from where the thing is right now and inherits the finger's speed;
   - where something lands is worked out from its momentum (the exponential-decay projection, rate 0.998). */

const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// A damped spring on one number. damping 1 = critically damped (no bounce); lower bounces. Velocity is in units per second.
export function spring({ from, to, velocity = 0, response = 0.4, damping = 1, onUpdate, onDone }) {
  if (reduce()) { onUpdate(to, 0); onDone && onDone(); return { stop() { }, get value() { return to; }, get velocity() { return 0; } }; }
  const k = Math.pow((2 * Math.PI) / response, 2), c = (4 * Math.PI * damping) / response;
  let x = from, v = velocity, last = performance.now(), raf = 0, dead = false;
  const step = now => {
    if (dead) return;
    const dt = Math.min(0.032, (now - last) / 1000); last = now;
    const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
    for (let i = 0; i < n; i++) { v += (-k * (x - to) - c * v) * h; x += v * h; }
    if (Math.abs(x - to) < 0.4 && Math.abs(v) < 6) { x = to; v = 0; onUpdate(to, 0); onDone && onDone(); return; }
    onUpdate(x, v); raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { stop() { dead = true; cancelAnimationFrame(raf); }, get value() { return x; }, get velocity() { return v; } };
}

// Where a flick would come to rest. v in px/s.
export const project = (pos, v, rate = 0.998) => pos + (v / 1000) * (rate / (1 - rate));

// Recent pointer speed (units per second) from the last ~80ms of samples.
function speed(samples) {
  const last = samples[samples.length - 1]; let first = last;
  for (let i = samples.length - 1; i >= 0 && last.t - samples[i].t <= 80; i--) first = samples[i];
  const dt = last.t - first.t; return dt > 0 ? ((last.p - first.p) / dt) * 1000 : 0;
}
const band = (over, limit = 70) => Math.sign(over) * limit * (1 - 1 / (Math.abs(over) / limit + 1)); // rubber band past the edge

/* Pull a bottom sheet down with a finger: it follows exactly, can be re-grabbed while it moves, and on release either
   closes or springs back, depending on where its momentum would carry it. `dismiss` should close the sheet. */
export function dragSheet(sheet, handles, { dismiss, scrim, enabled = () => matchMedia("(max-width: 639px)").matches }) {
  let sp = null, y = 0, d = null;
  const set = v => { y = v; sheet.style.transform = `translateY(${v}px)`; if (scrim) scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, v) / (sheet.offsetHeight * 1.1))); };
  const clean = () => { sheet.style.transform = ""; sheet.style.transition = ""; sheet.style.animation = ""; if (scrim) { scrim.style.opacity = ""; } };
  handles.filter(Boolean).forEach(h => {
    h.style.touchAction = "none";
    h.addEventListener("pointerdown", e => {
      if (!enabled() || (e.pointerType === "mouse" && e.button !== 0) || e.target.closest("button, input, select, textarea, a")) return;
      if (sp) { sp.stop(); sp = null; }
      let live = 0; try { live = new DOMMatrix(getComputedStyle(sheet).transform).m42 || 0; } catch (err) { }
      sheet.style.transition = "none"; sheet.style.animation = "none"; set(sp ? sp.value : live);
      h.setPointerCapture(e.pointerId);
      d = { id: e.pointerId, y0: e.clientY, base: y, s: [{ t: e.timeStamp, p: e.clientY }] };
    });
    h.addEventListener("pointermove", e => {
      if (!d || e.pointerId !== d.id) return;
      const raw = d.base + (e.clientY - d.y0); set(raw < 0 ? band(raw) : raw);
      d.s.push({ t: e.timeStamp, p: e.clientY }); if (d.s.length > 12) d.s.shift();
    });
    const up = e => {
      if (!d || e.pointerId !== d.id) return;
      const v = speed(d.s), h2 = sheet.offsetHeight, end = project(y, v), go = end > h2 * 0.5 || (v > 900 && y > 24);
      d = null;
      if (go) {
        dismiss();
        sp = spring({ from: y, to: h2 + 40, velocity: v, response: 0.32, damping: 1, onUpdate: set, onDone: () => { sp = null; clean(); } });
      } else {
        sp = spring({ from: y, to: 0, velocity: v, response: 0.42, damping: v > 300 ? 0.78 : 1, onUpdate: set, onDone: () => { sp = null; clean(); } });
      }
    };
    h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
  });
}

/* Swipe along the tab bar: the glass pill follows the finger and lands on the tab its momentum points to. A plain tap still clicks. */
export function swipeTabs(bar, tabs, current) {
  let d = null, n = tabs.length;
  bar.style.touchAction = "none";
  bar.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const r = bar.getBoundingClientRect(), pad = 6, col = (r.width - pad * 2) / n;
    d = { id: e.pointerId, x0: e.clientX, i0: current(), col, on: false, s: [{ t: e.timeStamp, p: e.clientX }], i: current() };
  });
  bar.addEventListener("pointermove", e => {
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    if (!d.on) { if (Math.abs(dx) < 8) return; d.on = true; bar.setPointerCapture(e.pointerId); bar.classList.add("swiping"); }
    let i = d.i0 + dx / d.col; i = i < 0 ? -band(-i * d.col, 40) / d.col : i > n - 1 ? n - 1 + band((i - (n - 1)) * d.col, 40) / d.col : i;
    d.i = i; bar.style.setProperty("--ti", i.toFixed(3));
    d.s.push({ t: e.timeStamp, p: e.clientX }); if (d.s.length > 12) d.s.shift();
  });
  const up = e => {
    if (!d || e.pointerId !== d.id) return;
    const was = d; d = null; if (!was.on) return;
    const v = speed(was.s) / was.col;                      // tabs per second
    const to = Math.max(0, Math.min(n - 1, Math.round(project(was.i, v, 0.99))));
    bar.classList.remove("swiping"); bar.style.removeProperty("--ti");
    bar.dataset.swiped = "1"; setTimeout(() => delete bar.dataset.swiped, 50);
    if (to !== was.i0) tabs[to].click(); else bar.style.setProperty("--ti", String(was.i0)), requestAnimationFrame(() => bar.style.removeProperty("--ti"));
  };
  bar.addEventListener("pointerup", up); bar.addEventListener("pointercancel", up);
}
