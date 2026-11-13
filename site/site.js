// Shiftbuck homepage: scroll reveals, the mobile menu, the pay count-up and the wandering worm. Nothing here is needed to read the page.
import { startDeco } from "../app/src/deco.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// mobile menu
const menu = document.getElementById("menu"), links = document.getElementById("links");
if (menu && links) {
  const set = open => { menu.setAttribute("aria-expanded", String(open)); links.classList.toggle("open", open); };
  menu.addEventListener("click", () => set(menu.getAttribute("aria-expanded") !== "true"));
  links.addEventListener("click", e => { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") set(false); });
}

// scroll reveal
const rv = [...document.querySelectorAll(".rv")];
if ("IntersectionObserver" in window && !reduce) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: .08 });
  rv.forEach(el => io.observe(el));
} else rv.forEach(el => el.classList.add("in"));

// the pay figure counts up once when the phone is first on screen
const pay = document.getElementById("payNum");
if (pay && !reduce) {
  const target = 1284.5, fmt = v => "£" + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  pay.textContent = fmt(0);
  let done = false;
  const run = () => {
    if (done) return; done = true;
    const t0 = performance.now() + 800, dur = 1500;
    const tick = now => { const p = Math.min(1, Math.max(0, (now - t0) / dur)); pay.textContent = fmt(target * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { run(); o.disconnect(); } }, { threshold: .3 }).observe(document.getElementById("phoneWrap"));
}

// the coin rolls along the trust strip once it is on screen
const strip = document.querySelector(".strip");
if (strip && !reduce) new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { strip.classList.add("go"); o.disconnect(); } }, { threshold: .5 }).observe(strip);

// the worm: only moves while its block is on screen
function worm(box, host) {
  if (!box) return;
  const io = new IntersectionObserver(es => host.classList.toggle("live", es[0].isIntersecting), { threshold: 0 });
  io.observe(host);
  startDeco(box, () => host.classList.contains("live"), host);
}
const hero = document.getElementById("hero");
worm(hero && hero.querySelector(".deco"), hero);
