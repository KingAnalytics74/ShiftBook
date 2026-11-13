/*
 * early.js — runs before the page paints, so a reload never flashes the previous screen.
 * It hides the app until Shiftbuck knows whether to show sign-in, setup or the app itself,
 * and paints the right background straight away. auth.js and app.js call SBReveal() once they know.
 * A 5-second safety timer reveals the page anyway so it can never stay blank.
 */
(function () {
  var h = document.documentElement, signed = false;
  try {
    if (localStorage.getItem("shiftbook:auth")) signed = true;
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^sb-.+-auth-token$/.test(k)) signed = true; }
  } catch (e) {}
  h.classList.add("boot");
  if (!signed) {
    h.classList.add("boot-light");
    var tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute("content", "#F9F8F4");
  }
  var done = false;
  window.SBReveal = function () {
    if (done) return; done = true;
    h.classList.remove("boot", "boot-light");
    h.classList.add("booted");
    setTimeout(function () { h.classList.remove("booted"); }, 400);
  };
  setTimeout(window.SBReveal, 5000);
})();
