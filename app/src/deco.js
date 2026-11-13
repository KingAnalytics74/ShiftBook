// The little gold worm that wanders the sign-in and setup pages (and the public homepage) and bounces off the edges.
// It is decoration only: it runs just while those pages are showing, pauses when the tab is hidden,
// and stands still (as a squiggle) if the person has asked for reduced motion.
const N = 26, GAP = 7.5, SPEED = 44;

// deco: the element holding the <svg class="worm">; active: says when the worm should be moving
// (by default, while the sign-in or setup pages are showing). The public homepage passes its own.
const onAppPages = () => document.body.classList.contains("authing") || document.body.classList.contains("onboarding");
export function startDeco(deco = document.querySelector(".deco"), active = onAppPages, watch = document.body) {
  const svg = deco && deco.querySelector(".worm");
  if (!svg) return;
  const [p1, p2, p3] = ["w1", "w2", "w3"].map(c => svg.querySelector("." + c));
  const head = svg.querySelector(".wh"), eye = svg.querySelector(".we");
  const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const showing = active;

  let pts = null, x = 0, y = 0, th = 0, t = 0, last = 0, raf = 0, W = 0, H = 0;

  function place() {
    W = deco.clientWidth; H = deco.clientHeight;
    x = W * 0.35; y = Math.min(H * 0.45, 320); th = Math.PI * 0.2 + Math.random() * 0.8;
    pts = Array.from({ length: N }, (_, i) => ({ x: x - Math.cos(th) * GAP * i, y: y - Math.sin(th) * GAP * i }));
  }

  // a smooth line through some of the points
  const line = (a, b, wob) => {
    let d = "";
    for (let i = a; i <= b && i < N; i++) {
      const q = pts[i], prev = pts[Math.max(0, i - 1)], next = pts[Math.min(N - 1, i + 1)];
      const dx = next.x - prev.x, dy = next.y - prev.y, len = Math.hypot(dx, dy) || 1;
      const k = wob * Math.sin(t * 4.2 - i * 0.55) * Math.min(1, i / 3); // sideways ripple, none at the head
      const px = q.x - (dy / len) * k, py = q.y + (dx / len) * k;
      d += (i === a ? "M" : "L") + px.toFixed(1) + " " + py.toFixed(1);
    }
    return d;
  };

  function draw() {
    p1.setAttribute("d", line(0, 9, 3.2));
    p2.setAttribute("d", line(9, 18, 3.2));
    p3.setAttribute("d", line(18, N - 1, 3.2));
    head.setAttribute("cx", pts[0].x.toFixed(1)); head.setAttribute("cy", pts[0].y.toFixed(1));
    eye.setAttribute("cx", (pts[0].x + Math.cos(th - 0.7) * 3.6 + Math.cos(th) * 2).toFixed(1));
    eye.setAttribute("cy", (pts[0].y + Math.sin(th - 0.7) * 3.6 + Math.sin(th) * 2).toFixed(1));
  }

  function step(now) {
    raf = requestAnimationFrame(step);
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (!showing() || document.hidden) return;
    if (!pts) place();
    W = deco.clientWidth; H = deco.clientHeight;
    t += dt;
    th += (Math.sin(t * 0.55) * 0.9 + Math.sin(t * 1.3 + 1) * 0.5) * dt; // slow, lazy turning
    x += Math.cos(th) * SPEED * dt; y += Math.sin(th) * SPEED * dt;
    const m = 12;
    if (x < m) { x = m; th = Math.PI - th; } else if (x > W - m) { x = W - m; th = Math.PI - th; }
    if (y < m) { y = m; th = -th; } else if (y > H - m) { y = H - m; th = -th; }
    pts[0].x = x; pts[0].y = y;
    for (let i = 1; i < N; i++) { // each piece follows the one in front
      const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      b.x = a.x + (dx / d) * GAP; b.y = a.y + (dy / d) * GAP;
    }
    draw();
  }

  function sync() {
    cancelAnimationFrame(raf); raf = 0;
    if (!showing()) return;
    if (calm()) { // resting pose: a wavy line
      place(); t = 0;
      pts.forEach((q, i) => { q.x = W * 0.12 + i * 9; q.y = Math.min(H * 0.8, 600) + Math.sin(i * 0.7) * 9; });
      th = 0; draw(); return;
    }
    last = performance.now(); raf = requestAnimationFrame(step);
  }
  new MutationObserver(sync).observe(watch, { attributes: true, attributeFilter: ["class"] });
  sync();
}
