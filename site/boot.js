// Email links (confirm, magic link, reset) can land on the homepage when Supabase's Site URL is the bare domain. Pass them straight on to the app, which signs the person in.
if (/[#&?](access_token|error_description|error_code)=|[?&]token_hash=/.test(location.hash + location.search)) {
  location.replace("/app/" + location.search + location.hash);
}

document.documentElement.classList.add("js");

// Signed in already? Then the homepage offers "Open app" instead of sign-up. Nothing is sent anywhere: it only looks for the sign-in kept by this browser tab.
try {
  var inn = false, i, k, v, s;
  for (i = 0; i < sessionStorage.length; i++) {
    k = sessionStorage.key(i);
    if (/^sb-.+-auth-token$/.test(k)) { v = JSON.parse(sessionStorage.getItem(k) || "null"); s = v && (v.currentSession || v); if (s && s.access_token) inn = true; }
  }
  v = JSON.parse(sessionStorage.getItem("shiftbook:auth") || "null");
  if (v && v.id) inn = true;
  if (inn) document.documentElement.classList.add("in");
} catch (e) {}
