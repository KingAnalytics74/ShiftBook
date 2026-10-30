<p align="center"><img src="favicon.svg" width="96" alt="Shiftbook logo"></p>

# Shiftbook

**Know your pay before payday.** A shift log, pay, tax and budgeting app built for UK care workers and support workers.

Powered by **WesTech Innovation**.

## Features

- **Sign in the way that suits you:** a 6-digit code by text or email, an email and password (with a reset link if it's forgotten), or Google / Apple. People stay signed in on their own phone.
- **Quick setup:** one question per screen (name, age group and sex, area, employer and community nickname, pay, pay month, usual shifts, who you support), then log a first shift and see what it pays.
- **Log shifts in seconds:** one-tap shift types (Day 08:00–20:00, Sleep-in 20:00–08:00, Day + sleep-in), service users, breaks and notes.
- **Pay analytics:** gross pay, an earnings build-up chart, weekly earnings, earnings by day of the week, a shift calendar and shifts by service user.
- **Take-home estimate:** UK income tax (any tax code), employee National Insurance, workplace pension and student loan, using 2026/27 rates. It matches a real payslip to the penny.
- **Payslip check:** compare a payslip line by line with your logged shifts.
- **Rest check:** red when you're not resting enough (7+ days in a row, more than 48 hours in 7 days, or about 36 hours on duty around a sleep-in).
- **Forecast:** predicts next week's shifts and pay from your usual pattern.
- **Money plan:** spending pots, a gross-to-take-home waterfall and plan vs spent analytics.
- **Carers' community:** talk about pay, your rights at work, rest and meet-ups under a nickname, in spaces by topic and a *Near me* feed for your area. House rules, automatic blocks on postcodes, phone numbers, emails, addresses and the names of people you support, a report button, and moderators who can hide posts (three reports hide a post automatically). Links to the CQC and Protect for real concerns.
- **Profiles and messages:** every carer in the community has a public profile with only their nickname and area (tap a nickname to see it). Carers can send each other **private messages** that only the two of them can read, with block, report and a "stop new messages" switch, plus rate limits (30 messages an hour, 10 new conversations a day). Everyone can **message the Shiftbook team**, and the team can reply and send **announcements** to every carer.
- **Bus fares:** add what you paid to get to each shift; Shiftbook shows what you keep after travel. Fares never go on the timesheet sent to your employer.
- **Your data, your control:** timesheet CSV, full JSON backup, and Delete my account.

## Try it now (demo mode)

With `app/src/config.js` left empty, Shiftbook runs in **demo mode**: the sign-in code is shown on screen and data stays in the browser. Nothing to set up.

```bash
npx serve .
# then open http://localhost:3000
```

## Go live with real accounts (Supabase)

1. **Create a project** at [supabase.com](https://supabase.com). Pick the London region for UK users.
2. **Create the database:** open **SQL Editor → New query**, paste `supabase/schema.sql` and run it. It creates one `documents` table, locks every row to its owner with row-level security, turns on live sync between devices, and adds `delete_my_account()`.
3. **Turn on sign-in methods** in **Authentication → Providers**:
   - **Email:** on by default. To send a 6-digit code instead of a link, go to **Authentication → Email Templates → Magic Link** and put `{{ .Token }}` in the message, for example *"Your Shiftbook code is {{ .Token }}"*.
   - **Email and password:** uses the same Email provider. Keep **Confirm email** on so people prove the email is theirs. Under **Authentication → Providers → Email**, set the minimum password length to 8 and, on a paid plan, turn on **leaked password protection**. The *Confirm signup* and *Reset password* email templates send the links, so check their wording. Set `password: false` in `app/src/config.js` to hide this option.
   - **Phone:** turn on Phone and connect an SMS provider such as Twilio. UK texts cost a few pence each.
   - **Google / Apple:** optional. Add the client IDs from Google Cloud or Apple Developer.
4. **Set the site address** in **Authentication → URL Configuration**: put your GitHub Pages address in *Site URL*, and add the app's address (for example `https://kinganalytics74.github.io/ShiftBook/app/`) to *Redirect URLs*. Email confirmation and password reset links bring people back to that address.
5. **Connect the app:** in **Project Settings → API**, copy the *Project URL* and the *anon public* key into `app/src/config.js`. Set `google` or `apple` to `true` if you turned them on. The anon key is safe to publish; row-level security protects the data.
6. **Moderators:** after you've signed up, find your user id in **Authentication → Users** and run `insert into public.community_moderators (user_id) values ('<your id>');` in the SQL Editor. Moderators see reported posts and can hide or unhide them. They are also **the Shiftbook team**: they read and answer messages to the team, send announcements, see reported private messages and can stop someone sending private messages. Private messages that nobody has reported stay unreadable to moderators in the app.
7. **Limit abuse:** in **Authentication → Rate Limits**, keep the limits on codes per hour.

### Deploy free on GitHub Pages

This repository is already published at **https://kinganalytics74.github.io/ShiftBook/** from the default branch, `/ (root)`. The root `index.html` forwards to `app/`, so whatever is merged into the default branch goes live a minute or two later. To publish a copy elsewhere: **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`.

## Legal pages, cookies and accessibility

- **Privacy notice and Terms of use** are built into the app (footer links, and linked from sign-up). Sign-up says that creating an account means agreeing to both. Fill in your contact details and check the reply time in *Complaints and appeals* (5 working days) before launch, and have both checked by a solicitor.
- **No cookie banner is needed** as built: there are no advertising, analytics or tracking cookies. The only things stored in the browser are the sign-in session, the last tab opened and, in demo mode, the user's own data. Fonts (`app/fonts/`, SIL Open Font License) and the Supabase library (`app/src/vendor/`, MIT) are served from this site, so no request goes to Google or a CDN. If you ever add analytics or third-party scripts, add consent first.
- **No refund policy yet**, because nothing is sold. Add one, with the 14-day cancellation rules for digital content, before charging for Shiftbook Plus.
- **Accessibility:** every screen, in light and dark mode, passes an automated WCAG 2.2 AA check (axe-core). Automated checks don't catch everything, so test with a screen reader and keyboard too.

## Working on Shiftbook

Engineers: read [CONTRIBUTING.md](CONTRIBUTING.md) before your first change. Starter tasks are in [docs/first-issues.md](docs/first-issues.md).

## Project structure

```
index.html               sends visitors on to app/ (GitHub Pages serves the repo root)
app/index.html           page markup: sign-in, setup, Overview, Log shift, Timesheet, Money, Forecast, Community, Privacy, Terms, FAQ
app/favicon.svg          the Shiftbook logo (day & night book)
app/fonts/               the app's font files (SIL Open Font License)
app/src/config.js        your Supabase URL and key, and which sign-in methods to show
app/src/auth.js          sign-in: phone or email code, Google, Apple, staying signed in, sign out, delete account
app/src/platform.js      storage layer: Supabase when configured, this browser's storage in demo mode
app/src/fonts.css         the app's fonts, served from app/fonts/ (no Google Fonts)
app/src/vendor/           the Supabase library, served from this site (no CDN)
app/src/community-store.js  the carers' community on Supabase (demo mode keeps posts in this browser)
app/src/app.js           app logic: pay rules, tax engine, rest check, forecast, charts, money plan, setup
app/src/styles.css       design tokens (light and dark) and all styles
supabase/schema.sql  database tables, row-level security, delete_my_account() and the community functions
docs/DATA_MODEL.md   documents, fields and rules
docs/00-start-here.md, docs/decisions.md, docs/first-issues.md   team notes, decisions and starter tasks
legacy-app/          the earlier single-user version, kept for reference
```

## Sign-up and sign-in

The first screen has two clear choices:

- **Create my Shiftbook** (sign up): choose phone or email and get a 6-digit code, or choose **email and password** and tap the link we email to confirm it. Then come the six setup screens and the first shift.
- **I already have an account** (sign in): the same code, then straight back to your shifts. If the number or email has no account yet, it says so and offers **Create one instead**, so nobody gets stuck.

A password is optional: people who'd rather not have one use a code. **Forgot your password?** emails a link to choose a new one, and the same link lets someone who signed up with an email code add a password. The code fills in automatically from the text on most phones, and **Resend code** appears after 30 seconds. People stay signed in on their own phone until they tap **Sign out**, which is at the bottom of every screen and in Timesheet → Your account.

| Action | Where | What happens |
|---|---|---|
| **Sign out** | Footer, or Timesheet → Your account | Signed out on this device. Data kept. |
| **Pause my account** | Timesheet → Your account | Signed out and the account is marked paused. Everything is kept. |
| **Reactivate** | Shown when a paused account signs in | One tap and they're back where they left off. |
| **Delete my account** | Privacy page | Account and all data removed for good. |

Everything else (tax code, payslip, money plan) is asked for when it's first needed, not up front.

## Roadmap

- [ ] Face ID / fingerprint unlock (passkeys)
- [ ] Multiple jobs and rates (nights, weekends, bank holidays)
- [ ] Weekly and four-weekly pay periods, Scottish tax bands
- [ ] Holiday tracker (in testing in the personal edition)
- [ ] Unit tests for the pay and tax engine

## Disclaimer

Tax, NI, pension and rest figures are **estimates**, not financial or legal advice. Your payslip is the final word, and contracts or opt-outs can change the working time limits.
