# Security

Shiftbuck holds care workers' pay, shifts and private messages. This page covers how it's protected, what the owner has to switch on, and how to report a problem.

## Reporting a problem

If you think you've found a security problem, **don't open a public GitHub issue**. Message the Shiftbuck team in the app (Community → Messages), or contact WesTech Innovation through [westechinnovation.com](https://westechinnovation.com/). Say what you found and how to repeat it. Please don't access or change other people's data while checking.

## What's built in

**People's data**
- Every database table has row-level security. Each person's documents can only be read or changed by them (`user_id = auth.uid()`), and a check stops a row being saved outside `data/users/<their id>/`.
- Community, message and team tables can't be read directly. Everything goes through views that never show user ids, and through functions that check who is asking. Moderator tools check `community_is_moderator()`.
- Posts always go out under the poster's own community profile, so nobody can post as another carer.
- Each document is capped at 256 KB, so one account can't fill the database.
- Rate limits: 20 posts an hour, 30 private messages an hour, 10 new conversations a day, 20 messages to the team an hour.

**Sign-in**
- Passwords are stored by Supabase Auth as a hash, never as typed. They must be at least 8 characters and not an obvious one. Reset links expire after an hour.
- "Forgot your password?" gives the same answer whether or not an account exists.

**In the browser**
- **Content Security Policy** (in each page's `<head>`): only this site's own scripts can run, and the app can only connect to Supabase. Any injected script is blocked.
- **Third-party code**: fonts and the Supabase library are served from this site. The only outside script is Google Analytics, loaded only after cookie consent (`app/src/analytics.js`), sent page visits only, with ad features off and private codes stripped from addresses. No ads or other trackers.
- **Clickjacking guard** (`app/src/guard.js`): the app stays hidden if another site puts it inside a frame.
- **On Vercel** (`vercel.json`): the same Content Security Policy is also sent as a header, with `frame-ancestors 'none'`, plus HTTPS-only (HSTS), `X-Frame-Options: DENY`, `nosniff`, and a Permissions-Policy that turns off camera, microphone and location. If the policy in `app/index.html` changes, change it in `vercel.json` too.
- **Referrer policy**: other sites aren't told which Shiftbuck page someone came from.
- Everything people type is escaped before it's shown on a page. Timesheet CSVs neutralise cells starting with `=`, `+`, `-` or `@`, so they can't run as formulas in Excel.

## What the owner must switch on

These are settings in Supabase, GitHub and the domain, and can't be done in code. Do them before real carers sign up.

**Supabase → Authentication**
- [ ] **Providers → Email:** keep **Confirm email** on. Set the minimum password length to 8. On a paid plan, turn on **leaked password protection**.
- [ ] **Rate Limits:** keep the defaults or lower them, for example 30 codes or emails an hour.
- [ ] **URL Configuration:** set *Site URL* to the live address and list only your own addresses under *Redirect URLs*.
- [ ] **Multi-factor authentication:** turn on TOTP, and make sure everyone in `community_moderators` uses it. Moderators can read reported messages.
- [ ] **Bot and abuse protection:** turn on CAPTCHA (Cloudflare Turnstile or hCaptcha) once sign-ups start. The app will then need the CAPTCHA widget and its address added to the Content Security Policy.

**Supabase → Project**
- [ ] Run `supabase/schema.sql`, then **Advisors → Security** and fix anything it lists.
- [ ] Keep the `service_role` key secret. It's never needed in the app. Only the founder or a named lead holds the live project login, with two-step sign-in on that account.
- [ ] Turn on daily backups (paid plan) or export the database regularly.

**GitHub**
- [ ] **Settings → Pages:** tick **Enforce HTTPS**.
- [ ] Turn on two-step sign-in for everyone with write access.
- [ ] **Settings → Branches:** protect the default branch so changes need a reviewed pull request (see CONTRIBUTING.md).
- [ ] **Settings → Code security:** turn on secret scanning and Dependabot alerts.

**Web address**
Shiftbuck lives at `https://shiftbuck.com` on Vercel, so it has its own browser storage, separate from any other site. The old `kinganalytics74.github.io` address only forwards to it. Keep two-step sign-in on the Vercel account and the domain account: whoever controls them controls where shiftbuck.com points. Supabase's *Site URL* and *Redirect URLs* must list only shiftbuck.com addresses.

## Demo mode

With `app/src/config.js` empty, there are no real accounts. Data stays in the browser on that device, unencrypted, and anyone using the same browser can see it. Don't use demo mode for real carers' data.

## Changing these protections

- A new outside service (analytics, CAPTCHA, a custom Supabase domain) must be added to the Content Security Policy in `app/index.html`, the privacy notice, and this page.
- Database changes need founder and Data Analyst sign-off (see CONTRIBUTING.md). Keep row-level security on for every table, and run the schema twice to check it re-runs cleanly.
