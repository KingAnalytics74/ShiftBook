/*
 * analytics.js — Google Analytics (G-7MZ433YNQC), only after the person says yes.
 *
 * Nothing is requested from Google until "Accept" is tapped on the cookie banner. The choice is kept in
 * this browser (shiftbuck:analytics = "yes" | "no") and can be changed any time from "Cookie settings"
 * in the footer. Saying no after yes clears Google's cookies and reloads the page.
 *
 * What's sent: page visits only. No user id, no shifts, pay or account details, and Google's advertising
 * features (signals, ad personalisation, ad storage) stay off. The address sent to Google is the page
 * without its #hash or query string, because sign-in and password-reset links carry private codes there;
 * only ad campaign tags (utm_*, gclid) are kept so you can see which ads bring people in.
 */
(function () {
  var ID = "G-7MZ433YNQC", KEY = "shiftbuck:analytics";
  var get = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  var set = function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} };
  var $ = function (id) { return document.getElementById(id); };
  var loaded = false;

  function safeUrl() {
    var keep = [];
    new URLSearchParams(location.search).forEach(function (v, k) { if (/^utm_|^gclid$/.test(k)) keep.push(encodeURIComponent(k) + "=" + encodeURIComponent(v)); });
    return location.origin + location.pathname + (keep.length ? "?" + keep.join("&") : "");
  }
  function load() {
    if (loaded) return; loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    window.gtag("js", new Date());
    window.gtag("config", ID, { page_location: safeUrl(), page_referrer: document.referrer ? document.referrer.split(/[?#]/)[0] : undefined,
      allow_google_signals: false, allow_ad_personalization_signals: false });
    var s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + ID;
    document.head.appendChild(s);
  }
  function clearGoogleCookies() {
    var host = location.hostname, parts = host.split("."), domains = ["", host];
    for (var i = 1; i < parts.length - 1; i++) domains.push("." + parts.slice(i).join("."));
    document.cookie.split(";").forEach(function (c) {
      var name = c.split("=")[0].trim();
      if (!/^_ga/.test(name)) return;
      domains.forEach(function (d) { document.cookie = name + "=; Max-Age=0; path=/" + (d ? "; domain=" + d : ""); });
    });
  }
  // focus moves to the banner only when someone opens it from "Cookie settings", never on page load
  function show(on, focus) { var b = $("consent"); if (b) b.hidden = !on; if (on && focus && $("consentYes")) $("consentYes").focus(); }
  function choose(yes) {
    var was = get(); set(yes ? "yes" : "no"); show(false);
    if (yes) load();
    else if (was === "yes") { clearGoogleCookies(); location.reload(); }
  }
  function start() {
    if ($("consentYes")) $("consentYes").onclick = function () { choose(true); };
    if ($("consentNo")) $("consentNo").onclick = function () { choose(false); };
    var cs = $("cookieSettings"); if (cs) cs.onclick = function () { show(true, true); };
    var c = get();
    if (c === "yes") load(); else if (c !== "no") show(true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
