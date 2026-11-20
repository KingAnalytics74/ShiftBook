// The moving picture on the sign-in and setup screens (wide screens only): a week of shifts builds up,
// the pay counts up, coins drop, and the rest light turns green. It loops. Nothing here touches the app's data.
(() => {
  const el = document.getElementById("scene"), pay = document.getElementById("scPay");
  if (!el || !pay) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const wide = matchMedia("(min-width: 1000px) and (min-height: 760px)");
  const TOTAL = 412.5, BUILD = 5200, LOOP = 11000;
  let raf = 0, t0 = 0, timer = 0;
  const show = v => { pay.textContent = v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","); };
  const stop = () => { cancelAnimationFrame(raf); clearTimeout(timer); el.classList.remove("run"); };
  function cycle() {
    el.classList.remove("run"); void el.offsetWidth; el.classList.add("run");
    t0 = performance.now(); show(0);
    const tick = now => {
      const k = Math.min(1, (now - t0 - 700) / BUILD);
      if (k > 0) show(TOTAL * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    timer = setTimeout(cycle, LOOP);
  }
  function sync() {
    stop();
    if (!wide.matches) return;
    if (reduce.matches) { el.classList.add("still"); show(TOTAL); return; }
    el.classList.remove("still"); cycle();
  }
  wide.addEventListener("change", sync); reduce.addEventListener("change", sync);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else sync(); });
  sync();
})();
