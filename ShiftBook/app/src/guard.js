/*
 * guard.js — stops Shiftbuck being shown inside another website's frame, where a hidden page could
 * trick people into tapping things (clickjacking). GitHub Pages can't send the frame-ancestors header,
 * so index.html hides the page until this confirms Shiftbuck is the top window.
 * Loaded first, before any other script.
 * It also moves anyone on the old GitHub Pages address to shiftbuck.com.
 */
(function () {
  // keep the page, ?query and #part, so old bookmarks and sign-in or password-reset links sent before the move still work
  if (location.hostname === "kinganalytics74.github.io") {
    location.replace("https://shiftbuck.com" + location.pathname.replace(/^\/ShiftBook/i, "") + location.search + location.hash);
    return;
  }
  if (window.top === window.self) {
    var s = document.getElementById("antiframe");
    if (s) s.parentNode.removeChild(s);
  } else {
    try { window.top.location = window.self.location.href; } catch (e) {}
  }
})();
