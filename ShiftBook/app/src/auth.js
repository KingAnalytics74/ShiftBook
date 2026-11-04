/*
 * auth.js — email/password, email-code, and Google sign-in for Shiftbuck.
 * Passwords: Supabase keeps only a hash. "Forgot your password?" emails a link that brings the person
 * back here to choose a new one (type=recovery in the URL). Someone who signed up with an email code
 * can use the same link to add a password to that account.
 *
 * Supabase mode (config.js filled in): real accounts, sessions kept for months on that device.
 * Demo mode (config.js empty): the code is shown on screen and the account lives in this browser,
 * so the whole journey can be tried on GitHub Pages without a backend.
 *
 * Exposes window.SBAuth:
 *   SBAuth.mode            "supabase" | "demo"
 *   SBAuth.session()       Promise that resolves with { id, email, phone } once someone is signed in
 *   SBAuth.client          the Supabase client (null in demo mode)
 *   SBAuth.signOut()       signs out and reloads
 *   SBAuth.deleteAccount() deletes the account itself (after app.js has deleted the data)
 */
(function () {
  const CFG = window.SHIFTBOOK_CONFIG || {};
  const WANT = { phone: false, email: true, password: true, google: false, apple: false, ...(CFG.signIn || {}) };
  // read before the Supabase client tidies the URL: a password-reset link lands here with type=recovery
  let recovering = /(^|[#&?])type=recovery(&|$)/.test(location.hash + location.search);
  const mode = CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase ? "supabase" : "demo";
  const client = mode === "supabase" ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
  const DEMO_KEY = "shiftbook:auth";
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let resolveSession; const sessionP = new Promise(r => { resolveSession = r; });
  let current = null;
  const store = { get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };

  // ---- identifiers ----
  function normPhone(v) {
    let s = String(v || "").replace(/[\s()-]/g, "");
    if (/^00/.test(s)) s = "+" + s.slice(2);
    if (/^0\d{9,10}$/.test(s)) s = (CFG.defaultCountryCode || "+44") + s.slice(1);
    return /^\+\d{8,15}$/.test(s) ? s : null;
  }
  const normEmail = v => { const s = String(v || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null; };
  const showId = (kind, id) => kind === "phone" ? id.replace(/^\+44(\d{4})(\d{6})$/, "0$1 $2") : id;
  const demoId = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return "demo-" + h.toString(36); };

  // ---- screens ----
  let kind = null, ident = null, demoCode = null, resendAt = 0, timer = null, busy = false;
  const root = () => $("#authBox");
  function setBusy(on, btn) { busy = on; root().querySelectorAll("button").forEach(b => b.disabled = on); if (btn) btn.dataset.label ||= btn.textContent, btn.textContent = on ? "Please wait…" : btn.dataset.label; }
  function err(msg, kind = "bad") {
    const e = $("#authErr"); if (!e) return;
    e.className = "banner " + kind; e.textContent = msg || ""; e.hidden = !msg;
  }

  // Email/password registration and sign-in; existing users may also request an email code.
  const ACCOUNTS = "shiftbook:accounts";           // demo mode only: which phones / emails have an account
  const demoHas = id => (store.get(ACCOUNTS) || []).includes(id);
  const demoAdd = id => store.set(ACCOUNTS, [...new Set([...(store.get(ACCOUNTS) || []), id])]);
  const demoDrop = id => store.set(ACCOUNTS, (store.get(ACCOUNTS) || []).filter(x => x !== id));
  let intent = "signup";
  const up = () => intent === "signup";
  const what = k => k === "phone" ? "phone number" : "email";

  function screenWelcome() { intent = "signin"; screenPassword(); }
  function screenChoose() { screenPassword(); }

  // ---- email and password ----
  const PW_MIN = 8;
  const here = () => location.origin + location.pathname;
  const PWS = "shiftbook:passwords";               // demo mode only: { email: { salt, hash } }
  async function demoHash(pw, salt) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pw));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  async function demoSetPw(email, pw) {
    const salt = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, "0")).join("");
    store.set(PWS, { ...(store.get(PWS) || {}), [email]: { salt, hash: await demoHash(pw, salt) } });
  }
  function pwProblem(pw, email) {
    if (pw.length < PW_MIN) return `Use at least ${PW_MIN} characters.`;
    if (/^(.)\1+$/.test(pw) || /^(12345678|password|qwerty|iloveyou|shiftbook)/i.test(pw)) return "That password is too easy to guess. Try three random words, like 'teapot-river-jumper'.";
    const name = (email || "").split("@")[0];
    if (name.length >= 4 && pw.toLowerCase().includes(name)) return "Don't put your email name in your password.";
    return "";
  }
  // password box with a Show button; `mine` sets the autocomplete hint for password managers
  const pwField = (id, label, hint, mine) => `<div class="field"><label for="${id}">${label}${hint ? ` <span class="hint">${hint}</span>` : ""}</label>
    <div class="pwrow"><input id="${id}" type="password" autocomplete="${mine}" autocapitalize="off" spellcheck="false"><button type="button" class="pwshow" data-show="${id}" aria-controls="${id}" aria-pressed="false">Show</button></div></div>`;
  function wireShow() {
    root().querySelectorAll("[data-show]").forEach(b => b.onclick = () => {
      const i = document.getElementById(b.dataset.show), on = i.type === "password";
      i.type = on ? "text" : "password"; b.textContent = on ? "Hide" : "Show"; b.setAttribute("aria-pressed", String(on));
    });
  }

  function screenPassword() {
    kind = "email"; err("");
    root().innerHTML = `
      <div class="authbrand"><img src="favicon.svg" alt=""><b>Shift<span>buck</span></b></div>
      <h2 class="obh">${up() ? "Create your account" : "Welcome back"}</h2>
      <p class="obsub">${up() ? "Create an account with your email. You'll need to verify your address before signing in." : "Sign in to pick up where you left off."}</p>
      <div class="banner bad" id="authErr" role="alert" aria-live="polite" hidden></div>
      <button type="button" class="btn secondary authbtn gbtn" id="googleSignIn"><span class="googlemark" aria-hidden="true">G</span>Continue with Google</button>
      <div class="authdivider"><span>or continue with email</span></div>
      <form id="authForm" novalidate>
        <div class="field"><label for="authId">Email address</label>
          <input id="authId" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="you@example.com" value="${esc(ident || "")}"></div>
        ${WANT.password ? pwField("authPw", up() ? "Password" : "Password", up() ? `at least ${PW_MIN} characters` : "", up() ? "new-password" : "current-password") : ""}
        ${WANT.password ? `<button class="btn authbtn" type="submit" id="authGo">${up() ? "Create account with email" : "Continue with email"}</button>` : ""}
        ${up() ? `<p class="obpriv" style="margin:0">By creating an account you agree to the <a href="#terms" data-info="terms">Terms of use</a> and to how we keep your data in our <a href="#privacy" data-info="privacy">privacy notice</a>.</p>` : `<button type="button" class="linkbtn2" id="emailCode">Email me a sign-in code</button><button type="button" class="linkbtn2" id="pwForgot">Forgot your password?</button>`}
      </form>
      <p class="obpriv">${up() ? `Already have an account? <button type="button" class="linkinline" id="swap">Sign in</button>` : `New to Shiftbuck? <button type="button" class="linkinline" id="swap">Create an account</button>`}</p>`;
    $("#googleSignIn").onclick = () => oauth("google");
    $("#swap").onclick = () => { intent = up() ? "signin" : "signup"; screenPassword(); };
    wireShow();
    setTimeout(() => $("#authId")?.focus(), 50);
    if (!up()) {
      $("#emailCode").onclick = () => { ident = normEmail($("#authId").value) || ident; screenEnter("email"); };
      $("#pwForgot").onclick = () => { ident = normEmail($("#authId").value) || ident; screenForgot(); };
    }
    $("#authForm").onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      const email = normEmail($("#authId").value), pw = $("#authPw").value;
      if (!email) { err("Enter a valid email address."); $("#authId").focus(); return; }
      if (!pw) { err("Enter your password."); return; }
      if (up()) { const p = pwProblem(pw, email); if (p) { err(p); return; } }
      ident = email; err(""); setBusy(true, $("#authGo"));
      try { await (up() ? pwSignUp(email, pw) : pwSignIn(email, pw)); }
      catch (e2) { pwError(e2, email); }
      finally { setBusy(false, $("#authGo")); }
    };
  }
  async function pwSignUp(email, pw) {
    if (mode === "supabase") {
      const { data, error } = await client.auth.signUp({ email, password: pw, options: { emailRedirectTo: here() } });
      if (error) throw error;
      // with email checks on, Supabase answers an existing email with a user that has no identities
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw { exists: true };
      if (data.session) signedIn(fromSupabase(data.user), true); else screenCheckEmail(email);
    } else {
      if ((store.get(PWS) || {})[email]) throw { exists: true };
      await demoSetPw(email, pw); demoAdd(email);
      const u = { id: demoId(email), email }; store.set(DEMO_KEY, u); signedIn(u, true);
    }
  }
  async function pwSignIn(email, pw) {
    if (mode === "supabase") {
      const { data, error } = await client.auth.signInWithPassword({ email, password: pw });
      if (error) throw error; signedIn(fromSupabase(data.user), true);
    } else {
      const rec = (store.get(PWS) || {})[email];
      if (!rec || rec.hash !== await demoHash(pw, rec.salt)) throw { badLogin: true };
      const u = { id: demoId(email), email }; store.set(DEMO_KEY, u); signedIn(u, true);
    }
  }
  function pwError(e, email) {
    const m = (e && e.message) || "";
    const offer = (label, fn) => { const box = $("#authErr"); if (box) { box.insertAdjacentHTML("beforeend", ` <button type="button" class="linkinline" id="pwOffer">${label}</button>`); $("#pwOffer").onclick = fn; } };
    if (e && e.exists || /already registered|already exists/i.test(m)) { err("There's already an account for that email."); offer("Sign in instead", () => { intent = "signin"; screenPassword(); }); }
    else if (e && e.badLogin || /invalid login credentials/i.test(m)) { err("The email or password is wrong. If you usually sign in with a code, use that, or reset your password to add one."); offer("Reset my password", screenForgot); }
    else if (/not confirmed/i.test(m)) { err("Confirm your email first: tap the link we sent you."); offer("Send the link again", () => screenCheckEmail(email, true)); }
    else if (/weak|pwned|leaked|characters/i.test(m)) err("That password is too easy to guess or has appeared in a data leak. Choose a different one.");
    else err(authFailure(e));
  }
  function authFailure(e) {
    const m = String((e && (e.message || e.msg)) || "").toLowerCase();
    if (/invalid login credentials|invalid email or password/.test(m)) return "The email or password is incorrect. Check your details or reset your password.";
    if (/already registered|already exists|user already/.test(m)) return "An account already uses this email. Sign in instead or reset your password.";
    if (/invalid.*otp|otp.*invalid|token.*invalid|expired.*(otp|token)|otp.*expired|token.*expired/.test(m)) return "That verification code is incorrect or expired. Check the latest email or request a new code.";
    if (/rate|security purposes|seconds|too many/.test(m)) return "Too many attempts. Wait a little before trying again.";
    if (/smtp|email.*(disabled|not configured|not enabled)|provider.*disabled|sending.*email/.test(m)) return "Email sending is not configured for this project. Check the Email provider and SMTP settings in Supabase.";
    if (/fetch|network|connection|timeout|temporar|server|unavailable/.test(m)) return "We couldn't reach the sign-in service. Check your connection and try again.";
    return "We couldn't complete that request. Check your details and connection, then try again.";
  }
  async function screenCheckEmail(email, resend) {
    root().innerHTML = `
      <h2 class="obh">Verify your email</h2>
      <div class="banner ok" role="status" aria-live="polite">Supabase accepted the verification request for <b>${esc(email)}</b>. Email delivery depends on the project's email settings.</div>
      <p class="obsub">If the message contains a 6-digit code, enter it below. If it contains a confirmation link, open the link to finish creating your account.</p>
      <form id="signupCodeForm" novalidate>
        <div class="field"><label for="authCode">Email verification code</label>
          <input id="authCode" class="codebox" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]*" placeholder="Enter code from email"></div>
        <div class="banner bad" id="authErr" role="alert" aria-live="polite" hidden></div>
        <button type="submit" class="btn authbtn" id="authVerify">Verify email</button>
      </form>
      <button type="button" class="linkbtn2" id="authResend" disabled></button>
      <p class="obpriv" style="margin:0">Can't find the message? Check your spam folder.</p>
      <button type="button" class="linkback" id="authBack">‹ Back to sign in</button>`;
    $("#authCode").focus();
    $("#signupCodeForm").onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      const token = $("#authCode").value.trim();
      if (!/^\d{4,10}$/.test(token)) { err("Enter the numeric code from the latest email."); $("#authCode").focus(); return; }
      setBusy(true, $("#authVerify"));
      try {
        const { data, error } = await client.auth.verifyOtp({ type: "signup", email, token });
        if (error) throw error;
        signedIn(fromSupabase(data.user), true);
      } catch (e2) {
        err(authFailure(e2));
        $("#authCode").select();
      } finally { setBusy(false, $("#authVerify")); }
    };
    const r = $("#authResend");
    const tick = () => {
      const seconds = Math.ceil((resendAt - Date.now()) / 1000);
      r.disabled = seconds > 0 || busy;
      r.textContent = seconds > 0 ? `Request another email in ${seconds}s` : "Send verification email again";
    };
    clearInterval(timer);
    timer = setInterval(tick, 1000);
    if (!resend) resendAt = Date.now() + 30000;
    tick();
    const again = async () => {
      if (busy || r.disabled) return;
      setBusy(true, r);
      try {
        const { error } = await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: here() } });
        if (error) throw error;
        resendAt = Date.now() + 30000;
        err("Supabase accepted another verification request. Check your email and use the newest code or link.", "ok");
        tick();
      } catch (e) { err(authFailure(e)); }
      finally { setBusy(false, r); tick(); }
    };
    r.onclick = again;
    $("#authBack").onclick = () => { intent = "signin"; screenPassword(); };
    if (resend) { resendAt = 0; r.disabled = false; again(); }
  }
  function screenForgot() {
    err("");
    root().innerHTML = `
      <button type="button" class="linkback" id="authBack">‹ Back</button>
      <h2 class="obh">Reset your password</h2>
      <p class="obsub">We'll email you a link to choose a new password. It works for one hour.</p>
      <form id="authForm" novalidate>
        <div class="field"><label for="authId">Email address</label>
          <input id="authId" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="you@example.com" value="${esc(ident || "")}"></div>
        <div class="banner bad" id="authErr" hidden></div>
        <button class="btn authbtn" type="submit" id="authGo">Email me a reset link</button>
      </form>`;
    $("#authBack").onclick = () => { intent = "signin"; screenPassword(); };
    setTimeout(() => $("#authId")?.focus(), 50);
    $("#authForm").onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      const email = normEmail($("#authId").value);
      if (!email) { err("Enter an email address like you@example.com."); return; }
      ident = email;
      if (mode !== "supabase") { screenNewPassword(email); return; }
      const btn = $("#authGo"); setBusy(true, btn);
      try {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: here() });
        if (error) throw error;
        // same answer whether or not the email has an account, so nobody can use this to check who's signed up
        root().innerHTML = `
          <h2 class="obh">Check your email</h2>
          <p class="obsub">Supabase accepted the password-reset request. If an account exists for <b>${esc(email)}</b>, a reset link can be sent; delivery depends on the project's email settings.</p>
          <p class="obpriv" style="margin:0">Can't see it? Check your spam folder.</p>
          <button type="button" class="linkback" id="authBack">‹ Back to sign in</button>`;
        $("#authBack").onclick = () => { intent = "signin"; screenPassword(); };
      } catch (e2) { err(authFailure(e2)); }
      finally { setBusy(false, btn); }
    };
  }
  // reached from the reset link (Supabase), or straight from "Forgot your password?" in demo mode
  function screenNewPassword(demoEmail) {
    document.body.classList.add("authing");
    const box = $("#view-auth"); if (box) box.hidden = false;
    root().innerHTML = `
      <h2 class="obh">Choose a new password</h2>
      ${mode === "demo" ? `<p class="authdemo"><b>Demo mode.</b> No email is sent, so you can choose a new password for ${esc(demoEmail || "")} here.</p>` : `<p class="obsub">Then you'll go straight to your shifts.</p>`}
      <form id="authForm" novalidate>
        ${pwField("authPw", "New password", `at least ${PW_MIN} characters`, "new-password")}
        <div class="banner bad" id="authErr" hidden></div>
        <button class="btn authbtn" type="submit" id="authGo">Save my new password</button>
      </form>`;
    wireShow();
    setTimeout(() => $("#authPw")?.focus(), 50);
    $("#authForm").onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      const pw = $("#authPw").value, p = pwProblem(pw, demoEmail || "");
      if (p) { err(p); return; }
      setBusy(true, $("#authGo"));
      try {
        if (mode === "supabase") {
          const { data, error } = await client.auth.updateUser({ password: pw });
          if (error) throw error;
          recovering = false; try { history.replaceState(null, "", location.pathname); } catch (e3) {}
          signedIn(fromSupabase(data.user), true);
        } else {
          await demoSetPw(demoEmail, pw); demoAdd(demoEmail);
          const u = { id: demoId(demoEmail), email: demoEmail }; store.set(DEMO_KEY, u); signedIn(u, true);
        }
      } catch (e2) {
        const m = (e2 && e2.message) || "";
        err(/same|different from the old/i.test(m) ? "Choose a password you haven't used here before." : /weak|pwned|leaked/i.test(m) ? "That password is too easy to guess or has appeared in a data leak. Choose a different one." : /session|expired|jwt/i.test(m) ? "This reset link has expired. Ask for a new one from the sign-in screen." : "That didn't save. Try again.");
      } finally { setBusy(false, $("#authGo")); }
    };
  }

  function screenEnter(k) {
    kind = k; err("");
    root().innerHTML = `
      <button type="button" class="linkback" id="authBack">‹ Back</button>
      <h2 class="obh">Continue with email</h2>
      <p class="obsub">Request a sign-in code for your email. The email may contain a code or a sign-in link, depending on the project's email template.</p>
      <form id="authForm" novalidate>
        <div class="field"><label for="authId">Email address</label>
          <input id="authId" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="you@example.com" value="${esc(ident || "")}"></div>
        <div class="banner bad" id="authErr" hidden></div>
        <button class="btn authbtn" type="submit" id="authSend">Continue with email</button>
        ${up() ? `<p class="obpriv" style="margin:0">By creating an account you agree to the <a href="#terms" data-info="terms">Terms of use</a> and to how we keep your data in our <a href="#privacy" data-info="privacy">privacy notice</a>.</p>` : ""}
      </form>`;
    $("#authBack").onclick = screenChoose;
    setTimeout(() => $("#authId")?.focus(), 50);
    $("#authForm").onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      const v = normEmail($("#authId").value);
      if (!v) { err("Enter a valid email address."); $("#authId").focus(); return; }
      ident = v; await sendCode($("#authSend"));
    };
  }

  async function sendCode(btn) {
    err(""); setBusy(true, btn);
    try {
      if (mode === "supabase") {
        const { error } = await client.auth.signInWithOtp({ email: ident, options: { shouldCreateUser: false, emailRedirectTo: here() } });
        if (error) throw error;
      } else {
        if (!up() && !demoHas(ident)) throw { noAccount: true };
        demoCode = String(Math.floor(100000 + Math.random() * 900000));
      }
      resendAt = Date.now() + 30000; screenCode();
    } catch (e) {
      const m = (e && e.message) || "";
      if (e && e.noAccount || /signups not allowed|user not found|not found/i.test(m)) {
        err(`We couldn't find a Shiftbuck account for that ${what(kind)}.`);
        const box = $("#authErr");
        if (box) { box.insertAdjacentHTML("beforeend", ` <button type="button" class="linkinline" id="makeIt">Create one instead</button>`); $("#makeIt").onclick = () => { intent = "signup"; sendCode($("#authSend")); }; }
      } else err(authFailure(e));
    } finally { setBusy(false, btn); }
  }

  function screenCode() {
    root().innerHTML = `
      <button type="button" class="linkback" id="authBack">‹ Change ${kind === "phone" ? "number" : "email"}</button>
      <h2 class="obh">Enter your code</h2>
      <p class="obsub">Supabase accepted a sign-in request for <b>${esc(ident)}</b>. Check your email: enter the code if the message contains one, or open its sign-in link.</p>
      ${mode === "demo" ? `<p class="authdemo">Demo mode: your code is <b class="num">${demoCode}</b></p>` : ""}
      ${mode === "demo" && up() && demoHas(ident) ? `<p class="obpriv" style="margin:0">You already have an account with this ${what(kind)}, so this code signs you in.</p>` : ""}
      <form id="codeForm" novalidate>
        <div class="field"><label for="authCode">Email verification code</label>
          <input id="authCode" class="codebox" inputmode="numeric" autocomplete="one-time-code" maxlength="10" pattern="[0-9]*" placeholder="Enter code from email"></div>
        <div class="banner bad" id="authErr" hidden></div>
        <button class="btn authbtn" type="submit" id="authVerify">${up() ? "Create my account" : "Sign in"}</button>
      </form>
      <button type="button" class="linkbtn2" id="authResend" disabled></button>`;
    $("#authBack").onclick = () => screenEnter(kind);
    const code = $("#authCode");
    setTimeout(() => { if (document.body.contains(code)) code.focus(); }, 50);
    code.oninput = () => { code.value = code.value.replace(/\D/g, "").slice(0, 10); err(""); };
    $("#codeForm").onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      const t = code.value.trim(); if (!/^\d{4,10}$/.test(t)) { err("Enter the numeric code from the latest email."); return; }
      setBusy(true, $("#authVerify"));
      try {
        if (mode === "supabase") {
          const { data, error } = await client.auth.verifyOtp(kind === "phone" ? { phone: ident, token: t, type: "sms" } : { email: ident, token: t, type: "email" });
          if (error) throw error; signedIn(fromSupabase(data.user), true);
        } else {
          if (t !== demoCode) throw new Error("bad code");
          const u = { id: demoId(ident), [kind]: ident }; demoAdd(ident); store.set(DEMO_KEY, u); signedIn(u, true);
        }
      } catch (e2) { err(authFailure(e2)); code.select(); }
      finally { setBusy(false, $("#authVerify")); }
    };
    const r = $("#authResend");
    const tick = () => { const s = Math.ceil((resendAt - Date.now()) / 1000); r.disabled = s > 0; r.textContent = s > 0 ? `Resend code in ${s}s` : "Resend code"; };
    clearInterval(timer); timer = setInterval(tick, 1000); tick();
    r.onclick = () => { if (!r.disabled) sendCode(r); };
  }

  // Supabase's public settings say which providers are switched on, so an unfinished setup shows
  // a plain message instead of sending people to an error page
  async function providerOn(provider) {
    const r = await fetch(CFG.supabaseUrl.replace(/\/+$/, "") + "/auth/v1/settings", { headers: { apikey: CFG.supabaseAnonKey } });
    if (!r.ok) throw new Error("provider settings unavailable");
    const j = await r.json();
    return !!(j.external && j.external[provider]);
  }
  async function oauth(provider) {
    if (mode !== "supabase") { err("Google sign-in is only available when Shiftbuck is connected to Supabase."); return; }
    const button = $("#googleSignIn");
    err(""); setBusy(true, button);
    try {
      if (!(await providerOn(provider))) {
        err("Google sign-in is not enabled for this Supabase project yet. Ask the project administrator to configure Google OAuth.");
        return;
      }
      const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: here() } });
      if (error) throw error;
    } catch (e) {
      err(authFailure(e));
    } finally { setBusy(false, button); }
  }
  // demo mode can't open Google, so it asks for the Gmail address the real flow would hand back
  function screenDemoGoogle() {
    err("");
    root().innerHTML = `
      <button type="button" class="linkback" id="authBack">‹ Back</button>
      <h2 class="obh">Continue with Google</h2>
      <p class="authdemo"><b>Demo mode.</b> In the live app this opens Google so you can pick your account. Here, type the Gmail address you'd use.</p>
      <form id="authForm" novalidate>
        <div class="field"><label for="authId">Google email address</label>
          <input id="authId" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="you@gmail.com"></div>
        <div class="banner bad" id="authErr" hidden></div>
        <button class="btn secondary authbtn gbtn" type="submit" id="authGo"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue</button>
        ${up() ? `<p class="obpriv" style="margin:0">By creating an account you agree to the <a href="#terms" data-info="terms">Terms of use</a> and to how we keep your data in our <a href="#privacy" data-info="privacy">privacy notice</a>.</p>` : ""}
      </form>`;
    $("#authBack").onclick = screenChoose;
    setTimeout(() => $("#authId")?.focus(), 50);
    $("#authForm").onsubmit = e => {
      e.preventDefault();
      const email = normEmail($("#authId").value);
      if (!email) { err("Enter an email address like you@gmail.com."); return; }
      const u = { id: demoId(email), email }; demoAdd(email); store.set(DEMO_KEY, u); signedIn(u, true);
    };
  }

  const fromSupabase = u => u ? { id: u.id, email: u.email || null, phone: u.phone ? "+" + String(u.phone).replace(/^\+/, "") : null } : null;
  // ---- paused accounts ----
  // Pausing keeps everything but signs the person out. data/users/<id>/account = { status: "paused" | "active", since }
  const acctPath = id => `data/users/${id}/account`;
  async function readAcct(id) {
    if (mode === "supabase") { const r = await client.from("documents").select("data").eq("path", acctPath(id)).limit(1); return r.data && r.data[0] ? r.data[0].data : null; }
    return store.get("shiftbook:" + acctPath(id));
  }
  async function writeAcct(id, data) {
    if (mode === "supabase") { const r = await client.from("documents").upsert({ path: acctPath(id), parent: `data/users/${id}`, user_id: id, data, updated_at: new Date().toISOString() }, { onConflict: "path" }); if (r.error) throw r.error; }
    else store.set("shiftbook:" + acctPath(id), data);
  }
  async function signedIn(u, notify = false) {
    current = u; clearInterval(timer);
    let acct = null; try { acct = await readAcct(u.id); } catch (e) {}
    if (acct && acct.status === "paused") { screenPaused(acct); return; }
    document.body.classList.remove("authing");
    const box = $("#view-auth"); if (box) box.hidden = true;
    fillAccount();
    if (notify) document.dispatchEvent(new Event("shiftbook:auth-success"));
    resolveSession(u);
  }
  function screenPaused(acct) {
    document.body.classList.add("authing");
    const box = $("#view-auth"); if (box) box.hidden = false;
    const since = acct.since ? new Date(acct.since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
    root().innerHTML = `
      <h2 class="obh">Your account is paused</h2>
      <p class="obsub">You paused Shiftbuck${since ? ` on ${esc(since)}` : ""}. All your shifts, payslips and settings are still here, just as you left them.</p>
      <div class="authstack">
        <button type="button" class="btn authbtn" id="reactBtn">Reactivate my account</button>
        <button type="button" class="btn secondary authbtn" id="pausedOut">Sign out</button>
      </div>
      <div class="banner bad" id="authErr" hidden></div>
      <p class="obpriv">Want to remove everything instead? Reactivate, then go to Privacy → Delete my account.</p>`;
    $("#reactBtn").onclick = async () => {
      setBusy(true, $("#reactBtn"));
      try { await writeAcct(current.id, { status: "active", since: new Date().toISOString(), reactivated: true }); location.reload(); }
      catch (e) { setBusy(false, $("#reactBtn")); err("That didn't work. Check your connection and try again."); }
    };
    $("#pausedOut").onclick = signOut;
  }
  async function pauseAccount() {
    if (!current) return;
    await writeAcct(current.id, { status: "paused", since: new Date().toISOString() });
    await signOut();
  }
  function fillAccount() {
    const w = $("#acctWho"); if (!w || !current) return;
    const who = current.phone ? showId("phone", current.phone) : current.email || "your account";
    w.innerHTML = `Signed in as <b>${esc(who)}</b>${mode === "demo" ? " · demo mode, saved in this browser" : ""}`;
  }
  async function signOut() {
    if (mode === "supabase") { try { await client.auth.signOut(); } catch (e) {} } else store.del(DEMO_KEY);
    try { sessionStorage.setItem("shiftbook:signedout", "1"); } catch (e) {}
    location.reload();
  }
  async function deleteAccount() {
    if (mode === "supabase") { const { error } = await client.rpc("delete_my_account"); if (error) throw error; await client.auth.signOut(); }
    else { const u = store.get(DEMO_KEY); if (u) { demoDrop(u.phone || u.email); store.del("shiftbook:" + acctPath(u.id)); } store.del(DEMO_KEY); }
  }

  // ---- start ----
  function needSignIn() {
    document.body.classList.add("authing");
    const sy = document.querySelector("#sync span:last-child"); if (sy) sy.textContent = "Not signed in";
    const box = $("#view-auth"); if (box) box.hidden = false;
    let out = false; try { out = sessionStorage.getItem("shiftbook:signedout") === "1"; sessionStorage.removeItem("shiftbook:signedout"); } catch (e) {}
    screenWelcome();
    if (out) { const h = root().querySelector(".obh"); if (h) h.insertAdjacentHTML("beforebegin", `<p class="authdemo" style="background:var(--good-soft)">You've signed out. Your data is safe and will be here when you sign back in.</p>`); }
  }
  async function start() {
    if (mode === "supabase") {
      const { data } = await client.auth.getSession();
      if (data && data.session && recovering) screenNewPassword();
      else if (data && data.session) signedIn(fromSupabase(data.session.user)); else needSignIn();
      client.auth.onAuthStateChange((ev, s) => {
        if (ev === "PASSWORD_RECOVERY") { recovering = true; screenNewPassword(); return; }
        if (ev === "SIGNED_IN" && s && !current && !recovering) signedIn(fromSupabase(s.user), true);
      });
    } else {
      const u = store.get(DEMO_KEY);
      if (u && u.id) signedIn(u); else needSignIn();
    }
    document.querySelectorAll("[data-signout]").forEach(b => b.onclick = signOut);
    const pz = $("#pauseBtn"), pzc = $("#pauseConfirm");
    if (pz && pzc) { pz.onclick = () => { pzc.hidden = false; pz.hidden = true; }; $("#pauseNo").onclick = () => { pzc.hidden = true; pz.hidden = false; }; $("#pauseYes").onclick = async () => { $("#pauseYes").disabled = true; try { await pauseAccount(); } catch (e) { $("#pauseYes").disabled = false; alertBox("That didn't work. Check your connection and try again."); } }; }
  }
  const alertBox = m => { const e = $("#pauseErr"); if (e) { e.textContent = m; e.hidden = false; } };
  window.SBAuth = { mode, client, session: () => sessionP, signOut, pauseAccount, deleteAccount, get user() { return current; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
