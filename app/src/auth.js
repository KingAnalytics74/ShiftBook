/*
 * auth.js — sign-in for Shiftbook. People sign in with a 6-digit code sent to their phone or email,
 * with an email and password, or with Google / Apple.
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
  const WANT = { phone: true, email: true, password: true, google: false, apple: false, ...(CFG.signIn || {}) };
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
  function err(msg) { const e = $("#authErr"); if (!e) return; e.textContent = msg || ""; e.hidden = !msg; }

  // Two clear paths: "Create my Shiftbook" (sign up) and "I already have an account" (sign in).
  // Both use a code; signing in with a number or email we don't know offers to create the account instead.
  const ACCOUNTS = "shiftbook:accounts";           // demo mode only: which phones / emails have an account
  const demoHas = id => (store.get(ACCOUNTS) || []).includes(id);
  const demoAdd = id => store.set(ACCOUNTS, [...new Set([...(store.get(ACCOUNTS) || []), id])]);
  const demoDrop = id => store.set(ACCOUNTS, (store.get(ACCOUNTS) || []).filter(x => x !== id));
  let intent = "signup";
  const up = () => intent === "signup";
  const what = k => k === "phone" ? "phone number" : "email";

  function screenWelcome() {
    kind = null; ident = null; clearInterval(timer);
    root().innerHTML = `
      <svg class="oblogo" viewBox="0 0 120 120" aria-hidden="true"><rect width="120" height="120" rx="28" fill="#C8102E"/><path d="M60 38 C50 32 36 31 24 34 L24 86 C36 83 50 84 60 90 Z" fill="#FFD23F" stroke="#FFFFFF" stroke-width="3.5" stroke-linejoin="round"/><path d="M60 38 C70 32 84 31 96 34 L96 86 C84 83 70 84 60 90 Z" fill="#14213D" stroke="#FFFFFF" stroke-width="3.5" stroke-linejoin="round"/><circle cx="42" cy="60" r="8" fill="#C8102E"/><circle cx="78" cy="58" r="9" fill="#FFD23F"/><circle cx="82.5" cy="54.5" r="8" fill="#14213D"/></svg>
      <h2 class="obh">Know your pay before payday</h2>
      <ul class="obwhy">
        <li><b>See what every shift pays</b>, including sleep-ins, as you log it.</li>
        <li><b>Check your payslip</b> and your take-home after tax.</li>
        <li><b>Get a warning</b> when you're not getting enough rest.</li>
      </ul>
      <div class="authstack">
        <button type="button" class="btn authbtn" id="goUp">Create my Shiftbook</button>
        <button type="button" class="btn secondary authbtn" id="goIn">I already have an account</button>
      </div>
      <p class="obpriv">Free for care workers. Your shifts and pay are private to you; your employer can't see them. <a href="#privacy" data-info="privacy">How your data is kept</a></p>
      ${mode === "demo" ? `<p class="authdemo"><b>Demo mode.</b> No codes are really sent and your data stays in this browser. Add your Supabase details in <code>src/config.js</code> to go live.</p>` : ""}`;
    $("#goUp").onclick = () => { intent = "signup"; screenChoose(); };
    $("#goIn").onclick = () => { intent = "signin"; screenChoose(); };
  }

  function screenChoose() {
    kind = null; ident = null; clearInterval(timer);
    const verb = up() ? "Sign up" : "Sign in";
    const opts = [];
    if (WANT.phone) opts.push(`<button type="button" class="btn authbtn" data-a="phone">${verb} with phone number</button>`);
    if (WANT.email) opts.push(`<button type="button" class="btn ${WANT.phone ? "secondary" : ""} authbtn" data-a="email">${verb} with email code</button>`);
    if (WANT.password) opts.push(`<button type="button" class="btn ${WANT.phone || WANT.email ? "secondary" : ""} authbtn" data-a="password">${verb} with email and password</button>`);
    const social = [];
    if (WANT.google) social.push(`<button type="button" class="btn secondary authbtn" data-a="google">Continue with Google</button>`);
    if (WANT.apple) social.push(`<button type="button" class="btn secondary authbtn" data-a="apple">Continue with Apple</button>`);
    root().innerHTML = `
      <button type="button" class="linkback" id="authBack">‹ Back</button>
      <h2 class="obh">${up() ? "Create your Shiftbook" : "Welcome back"}</h2>
      <p class="obsub">${up() ? (WANT.password ? "Choose a password, or skip it and we'll text or email you a code each time you sign in on a new device." : "No password to remember. We'll text or email you a code each time you sign in on a new device.") : (WANT.password ? "Use the phone number or email you signed up with. We'll send you a code, or you can use your password." : "Use the phone number or email you signed up with. We'll send you a code.")}</p>
      <div class="authstack">${opts.join("")}${social.length ? `<div class="author"><span>or</span></div>${social.join("")}` : ""}</div>
      <div class="banner bad" id="authErr" hidden></div>
      <p class="obpriv">${up() ? `Already have an account? <button type="button" class="linkinline" id="swap">Sign in</button>` : `New to Shiftbook? <button type="button" class="linkinline" id="swap">Create an account</button>`}</p>`;
    $("#authBack").onclick = screenWelcome;
    $("#swap").onclick = () => { intent = up() ? "signin" : "signup"; screenChoose(); };
    root().querySelectorAll("[data-a]").forEach(b => b.onclick = () => { const a = b.dataset.a; if (a === "google" || a === "apple") oauth(a); else if (a === "password") screenPassword(); else screenEnter(a); });
  }

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
      <button type="button" class="linkback" id="authBack">‹ Back</button>
      <h2 class="obh">${up() ? "Create your account" : "Sign in with your password"}</h2>
      <p class="obsub">${up() ? "Use an email you can open. We'll send you a link to check it's yours." : "Use the email and password you signed up with."}</p>
      <form id="authForm" novalidate>
        <div class="field"><label for="authId">Email address</label>
          <input id="authId" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="you@example.com" value="${esc(ident || "")}"></div>
        ${pwField("authPw", up() ? "Choose a password" : "Password", up() ? `at least ${PW_MIN} characters` : "", up() ? "new-password" : "current-password")}
        <div class="banner bad" id="authErr" hidden></div>
        <button class="btn authbtn" type="submit" id="authGo">${up() ? "Create my account" : "Sign in"}</button>
        ${up() ? `<p class="obpriv" style="margin:0">By creating an account you agree to the <a href="#terms" data-info="terms">Terms of use</a> and to how we keep your data in our <a href="#privacy" data-info="privacy">privacy notice</a>.</p>` : `<button type="button" class="linkbtn2" id="pwForgot">Forgot your password?</button>`}
      </form>`;
    $("#authBack").onclick = screenChoose;
    wireShow();
    setTimeout(() => $(ident ? "#authPw" : "#authId")?.focus(), 50);
    if (!up()) $("#pwForgot").onclick = () => { ident = normEmail($("#authId").value) || ident; screenForgot(); };
    $("#authForm").onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      const email = normEmail($("#authId").value), pw = $("#authPw").value;
      if (!email) { err("Enter an email address like you@example.com."); return; }
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
      if (data.session) signedIn(fromSupabase(data.user)); else screenCheckEmail(email);
    } else {
      if ((store.get(PWS) || {})[email]) throw { exists: true };
      await demoSetPw(email, pw); demoAdd(email);
      const u = { id: demoId(email), email }; store.set(DEMO_KEY, u); signedIn(u);
    }
  }
  async function pwSignIn(email, pw) {
    if (mode === "supabase") {
      const { data, error } = await client.auth.signInWithPassword({ email, password: pw });
      if (error) throw error; signedIn(fromSupabase(data.user));
    } else {
      const rec = (store.get(PWS) || {})[email];
      if (!rec || rec.hash !== await demoHash(pw, rec.salt)) throw { badLogin: true };
      const u = { id: demoId(email), email }; store.set(DEMO_KEY, u); signedIn(u);
    }
  }
  function pwError(e, email) {
    const m = (e && e.message) || "";
    const offer = (label, fn) => { const box = $("#authErr"); if (box) { box.insertAdjacentHTML("beforeend", ` <button type="button" class="linkinline" id="pwOffer">${label}</button>`); $("#pwOffer").onclick = fn; } };
    if (e && e.exists || /already registered|already exists/i.test(m)) { err("There's already an account for that email."); offer("Sign in instead", () => { intent = "signin"; screenPassword(); }); }
    else if (e && e.badLogin || /invalid login credentials/i.test(m)) { err("The email or password is wrong. If you usually sign in with a code, use that, or reset your password to add one."); offer("Reset my password", screenForgot); }
    else if (/not confirmed/i.test(m)) { err("Confirm your email first: tap the link we sent you."); offer("Send the link again", () => screenCheckEmail(email, true)); }
    else if (/weak|pwned|leaked|characters/i.test(m)) err("That password is too easy to guess or has appeared in a data leak. Choose a different one.");
    else err(/rate|security purposes|seconds|too many/i.test(m) ? "Too many tries. Wait a minute and try again." : "That didn't work. Check your connection and try again.");
  }
  async function screenCheckEmail(email, resend) {
    root().innerHTML = `
      <h2 class="obh">Check your email</h2>
      <p class="obsub">We've sent a link to <b>${esc(email)}</b>. Tap it to finish creating your account. It brings you straight back to Shiftbook.</p>
      <p class="obpriv" style="margin:0">Can't see it? Check your spam folder.</p>
      <div class="banner bad" id="authErr" hidden></div>
      <button type="button" class="linkbtn2" id="authResend">Send the link again</button>
      <button type="button" class="linkback" id="authBack">‹ Back to sign in</button>`;
    const again = async () => {
      setBusy(true, $("#authResend"));
      try { const { error } = await client.auth.resend({ type: "signup", email, options: { emailRedirectTo: here() } }); if (error) throw error; err(""); $("#authResend").dataset.label = "Link sent again"; }
      catch (e) { err(/rate|seconds/i.test((e && e.message) || "") ? "Wait a minute before asking for another link." : "We couldn't send the link. Try again."); }
      finally { setBusy(false, $("#authResend")); }
    };
    $("#authResend").onclick = again;
    $("#authBack").onclick = () => { intent = "signin"; screenPassword(); };
    if (resend) again();
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
          <p class="obsub">If there's a Shiftbook account for <b>${esc(email)}</b>, we've sent it a link to choose a new password. The link works for one hour.</p>
          <p class="obpriv" style="margin:0">Can't see it? Check your spam folder.</p>
          <button type="button" class="linkback" id="authBack">‹ Back to sign in</button>`;
        $("#authBack").onclick = () => { intent = "signin"; screenPassword(); };
      } catch (e2) { err(/rate|seconds/i.test((e2 && e2.message) || "") ? "Wait a minute before asking for another link." : "We couldn't send the link. Try again."); }
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
          signedIn(fromSupabase(data.user));
        } else {
          await demoSetPw(demoEmail, pw); demoAdd(demoEmail);
          const u = { id: demoId(demoEmail), email: demoEmail }; store.set(DEMO_KEY, u); signedIn(u);
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
      <h2 class="obh">${k === "phone" ? "What's your mobile number?" : "What's your email?"}</h2>
      <p class="obsub">We'll send a 6-digit code to ${up() ? "create your account" : "sign you in"}. ${k === "phone" ? "Standard text rates may apply." : "Check your spam folder if it doesn't arrive."}</p>
      <form id="authForm" novalidate>
        <div class="field"><label for="authId">${k === "phone" ? "Mobile number" : "Email address"}</label>
          <input id="authId" ${k === "phone" ? 'type="tel" inputmode="tel" autocomplete="tel" placeholder="07700 900123"' : 'type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="you@example.com"'}></div>
        <div class="banner bad" id="authErr" hidden></div>
        <button class="btn authbtn" type="submit" id="authSend">Send my code</button>
        ${up() ? `<p class="obpriv" style="margin:0">By creating an account you agree to the <a href="#terms" data-info="terms">Terms of use</a> and to how we keep your data in our <a href="#privacy" data-info="privacy">privacy notice</a>.</p>` : ""}
      </form>`;
    $("#authBack").onclick = screenChoose;
    setTimeout(() => $("#authId")?.focus(), 50);
    $("#authForm").onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      const v = k === "phone" ? normPhone($("#authId").value) : normEmail($("#authId").value);
      if (!v) { err(k === "phone" ? "Enter a UK mobile number like 07700 900123, or a full number starting with +." : "Enter an email address like you@example.com."); return; }
      ident = v; await sendCode($("#authSend"));
    };
  }

  async function sendCode(btn) {
    err(""); setBusy(true, btn);
    try {
      if (mode === "supabase") {
        const options = { shouldCreateUser: up() };
        const { error } = await client.auth.signInWithOtp(kind === "phone" ? { phone: ident, options } : { email: ident, options });
        if (error) throw error;
      } else {
        if (!up() && !demoHas(ident)) throw { noAccount: true };
        demoCode = String(Math.floor(100000 + Math.random() * 900000));
      }
      resendAt = Date.now() + 30000; screenCode();
    } catch (e) {
      const m = (e && e.message) || "";
      if (e && e.noAccount || /signups not allowed|user not found|not found/i.test(m)) {
        err(`We couldn't find a Shiftbook account for that ${what(kind)}.`);
        const box = $("#authErr");
        if (box) { box.insertAdjacentHTML("beforeend", ` <button type="button" class="linkinline" id="makeIt">Create one instead</button>`); $("#makeIt").onclick = () => { intent = "signup"; sendCode($("#authSend")); }; }
      } else err(/rate|security purposes|seconds/i.test(m) ? "Too many codes asked for. Wait a minute and try again." : "We couldn't send a code. Check the number or email and try again.");
    } finally { setBusy(false, btn); }
  }

  function screenCode() {
    root().innerHTML = `
      <button type="button" class="linkback" id="authBack">‹ Change ${kind === "phone" ? "number" : "email"}</button>
      <h2 class="obh">Enter your code</h2>
      <p class="obsub">We sent a 6-digit code to <b>${esc(showId(kind, ident))}</b>.</p>
      ${mode === "demo" ? `<p class="authdemo">Demo mode: your code is <b class="num">${demoCode}</b></p>` : ""}
      ${mode === "demo" && up() && demoHas(ident) ? `<p class="obpriv" style="margin:0">You already have an account with this ${what(kind)}, so this code signs you in.</p>` : ""}
      <form id="codeForm" novalidate>
        <div class="field"><label for="authCode">6-digit code</label>
          <input id="authCode" class="codebox" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="••••••"></div>
        <div class="banner bad" id="authErr" hidden></div>
        <button class="btn authbtn" type="submit" id="authVerify">${up() ? "Create my account" : "Sign in"}</button>
      </form>
      <button type="button" class="linkbtn2" id="authResend" disabled></button>`;
    $("#authBack").onclick = () => screenEnter(kind);
    const code = $("#authCode");
    setTimeout(() => { if (document.body.contains(code)) code.focus(); }, 50);
    code.oninput = () => { code.value = code.value.replace(/\D/g, "").slice(0, 6); err(""); if (code.value.length === 6) $("#codeForm").requestSubmit(); };
    $("#codeForm").onsubmit = async e => {
      e.preventDefault(); if (busy) return;
      const t = code.value.trim(); if (t.length !== 6) { err("Enter all 6 digits."); return; }
      setBusy(true, $("#authVerify"));
      try {
        if (mode === "supabase") {
          const { data, error } = await client.auth.verifyOtp(kind === "phone" ? { phone: ident, token: t, type: "sms" } : { email: ident, token: t, type: "email" });
          if (error) throw error; signedIn(fromSupabase(data.user));
        } else {
          if (t !== demoCode) throw new Error("bad code");
          const u = { id: demoId(ident), [kind]: ident }; demoAdd(ident); store.set(DEMO_KEY, u); signedIn(u);
        }
      } catch (e2) { err("That code didn't work or has expired. Check it, or ask for a new code."); code.select(); }
      finally { setBusy(false, $("#authVerify")); }
    };
    const r = $("#authResend");
    const tick = () => { const s = Math.ceil((resendAt - Date.now()) / 1000); r.disabled = s > 0; r.textContent = s > 0 ? `Resend code in ${s}s` : "Resend code"; };
    clearInterval(timer); timer = setInterval(tick, 1000); tick();
    r.onclick = () => { if (!r.disabled) sendCode(r); };
  }

  async function oauth(provider) {
    if (mode !== "supabase") { err(`${provider === "google" ? "Google" : "Apple"} sign-in needs Supabase set up first.`); return; }
    const { error } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
    if (error) err("That didn't work. Try another way to sign in.");
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
  async function signedIn(u) {
    current = u; clearInterval(timer);
    let acct = null; try { acct = await readAcct(u.id); } catch (e) {}
    if (acct && acct.status === "paused") { screenPaused(acct); return; }
    document.body.classList.remove("authing");
    const box = $("#view-auth"); if (box) box.hidden = true;
    fillAccount();
    resolveSession(u);
  }
  function screenPaused(acct) {
    document.body.classList.add("authing");
    const box = $("#view-auth"); if (box) box.hidden = false;
    const since = acct.since ? new Date(acct.since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
    root().innerHTML = `
      <h2 class="obh">Your account is paused</h2>
      <p class="obsub">You paused Shiftbook${since ? ` on ${esc(since)}` : ""}. All your shifts, payslips and settings are still here, just as you left them.</p>
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
        if (ev === "SIGNED_IN" && s && !current && !recovering) signedIn(fromSupabase(s.user));
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
