/*
 * guard.js — stops Shiftbook being shown inside another website's frame, where a hidden page could
 * trick people into tapping things (clickjacking). GitHub Pages can't send the frame-ancestors header,
 * so index.html hides the page until this confirms Shiftbook is the top window.
 * Loaded first, before any other script.
 */
(function () {
  if (window.top === window.self) {
    var s = document.getElementById("antiframe");
    if (s) s.parentNode.removeChild(s);
  } else {
    try { window.top.location = window.self.location.href; } catch (e) {}
  }
})();
