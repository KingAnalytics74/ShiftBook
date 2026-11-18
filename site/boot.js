document.documentElement.classList.add("js");

// Signed in already? Then the homepage offers "Open app" instead of sign-up. Nothing is sent anywhere: it only looks for the saved session.
try {
  var inn = false, i, k, v, s;
  for (i = 0; i < localStorage.length; i++) {
    k = localStorage.key(i);
    if (/^sb-.+-auth-token$/.test(k)) { v = JSON.parse(localStorage.getItem(k) || "null"); s = v && (v.currentSession || v); if (s && s.access_token) inn = true; }
  }
  v = JSON.parse(localStorage.getItem("shiftbook:auth") || "null");
  if (v && v.id) inn = true;
  if (inn) document.documentElement.classList.add("in");
} catch (e) {}
