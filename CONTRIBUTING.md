# Contributing to Shiftbook

Welcome to the team. Shiftbook shows UK care workers what they've earned before payday, checks their payslip and warns them when they aren't resting enough. Read the **Shiftbook Product Overview** and the **Design Brief and App Flow** first (ask Babatope to share them), then this guide.

## Ground rules

1. **Carers' data is never in your hands.** Work only on the **test** Supabase project. Never ask for, copy, export or screenshot data from the live project. Only the founder (or a named lead) holds the live project login and the secret `service_role` key.
2. **No secrets in the repo.** The public `anon` key in `app/src/config.js` is safe to commit. The `service_role` key, passwords and SMS provider tokens are never committed, pasted in chat or sent by WhatsApp. If one leaks, tell Babatope straight away so it can be rotated.
3. **Never use real people in test data.** No real carers, service users, addresses or employers. Use made-up names like "Ada" and "Sam".
4. **No tracking.** Don't add analytics, ad scripts, third-party fonts or CDNs. Everything is served from this site; the only outside service is Supabase. Adding one needs a privacy notice change and a cookie consent decision first.
5. **Keep it accessible.** Real `<button>`, `<a>` and labelled `<input>` elements, 44px tap targets, text contrast of at least 4.5:1 in light and dark mode.
6. **Plain UK English** in everything people read: short sentences, "take-home" not "net pay", no jargon.

## How the code is laid out

```
app/index.html           all screens (sections with id="view-…")
app/src/styles.css           styles; colours are CSS variables at the top (see the design brief)
app/src/app.js               app logic: shifts, pay, tax, rest check, money, community UI
app/src/auth.js              sign-up, sign-in, pause, delete account
app/src/platform.js          storage: Supabase when configured, this browser in demo mode
app/src/community-store.js   community, profiles, messages on Supabase
app/src/config.js            Supabase URL and anon key (empty = demo mode)
app/src/guard.js             keeps the app hidden if another site frames it (loaded first)
supabase/schema.sql      tables, row-level security and functions
docs/DATA_MODEL.md       what is stored where and who can read it
```

There is no build step and no framework. Open the site with any static server.

## Running it

**Demo mode** (no accounts, data stays in your browser):

```
python3 -m http.server 3000
# open http://localhost:3000
```

**With the test Supabase project:** put the test project's URL and anon key in `app/src/config.js` on your own machine. Don't commit that change unless Babatope asks you to.

## Making a change

1. Pick an issue (see `docs/first-issues.md`) and tell the product manager you're on it.
2. Create a branch named `feature/<your-name>-<what>` or `fix/<your-name>-<what>`, for example `feature/edet-holiday-tracking`.
3. Keep changes small: one feature or fix per pull request.
4. **Database changes** need sign-off from the founder and the Data Analyst before they are merged (see `docs/decisions.md`). They go in `supabase/schema.sql`, must run cleanly twice in a row, and keep row-level security on for every table. Nobody reads a table directly: add a view without user ids, or a `security definer` function that checks `auth.uid()`.
5. Test it yourself (checklist below), then open a pull request into the default branch.

## Before you open a pull request

- [ ] Works in demo mode and against the test Supabase project
- [ ] Checked on a phone-sized screen (390px wide) and on desktop
- [ ] Checked in light and dark mode
- [ ] No errors in the browser console, including "Refused to load" messages from the Content Security Policy
- [ ] Text people type is shown with `esc()` or `textContent`, never put into HTML as it is
- [ ] Pay figures checked by hand for at least one shift (hours × rate + sleep-in)
- [ ] Nothing a user types can identify a service user in shared places (posts, messages)
- [ ] `docs/DATA_MODEL.md` updated if you changed what is stored
- [ ] Privacy notice updated if you collect something new

## Pull requests

Describe **what** changed, **why**, and **how you tested it**, with a screenshot for anything visible. Babatope (or the lead he names) reviews every pull request; nothing is merged into the default branch without approval. The default branch is what GitHub Pages puts live.

## Asking for help

Ask the product manager about what to build and why; ask Babatope about pay rules, care work and anything legal. If you're unsure whether something is safe for carers' privacy, stop and ask before building it.
