# Shiftbook

A personal shift log, pay calculator and money planner for support workers and carers. Log your shifts and Shiftbook works out your pay, your timesheet, your take-home and whether you're getting enough rest.

**Use it online:** https://kinganalytics74.github.io/ShiftBook/

It's a single page (`index.html`) that works on phones and computers. There's nothing to install.

## What it does

- **Overview:** gross pay for the pay period, estimated take-home, earnings build-up, weekly earnings, a shift calendar, shifts by service user and earnings by day of the week.
- **Rest check:** flags long runs of days without a day off, weeks over 48 hours, and day shifts straight after a sleep-in. It's based on UK working time rules and is a guide, not legal advice.
- **Log shift:** date, service user(s), sleep-in, day hours and unpaid break, with the pay for that shift shown as you type.
- **Timesheet:** the full pay period in a table, with CSV download, a summary you can copy for your manager, and backup and restore.
- **Money:** take-home after income tax, National Insurance, pension and student loan (2026/27 rates for England, Wales and Northern Ireland), a payslip check, and a spending plan with pots and spending charts.
- **Money borrowed & lent:** a record of money you've borrowed from or lent to people: who, how much, when it's due, repayments, what's left, what's overdue, and how much of your take-home you owe. When you're signed in, Shiftbook asks you to confirm it's you (password, Google or a text code) before any change to these records. Shiftbook keeps a record only. It doesn't lend, borrow or move money.
- **Sign in (optional):** with a Google account, any email and password, or a mobile number with a text code. Once you're signed in, your shifts show up on every device. See [Turning on sign-in](#turning-on-sign-in).

## How pay is worked out

- Net hours = day hours − unpaid break
- Pay for a shift = net hours × hourly rate + sleep-in rate (if it was a sleep-in)
- A pay period runs from your chosen start day (1–28) to the day before that date the next month.

Tax and deductions are estimates. Your payslip is the final word.

## Getting started

1. Open the link above.
2. Fill in the setup screen: your name, role, hourly rate, sleep-in rate, the day your pay period starts, and your service users.
3. Log your shifts on the **Log shift** tab.

On a phone, use **Add to Home Screen** in your browser's menu to open it like an app.

## Where your data is kept

- **On the website, signed in:** shifts are saved to your account in Firebase (Google's app database). Each person can only read and write their own data. This is enforced by [`firestore.rules`](firestore.rules).
- **On the website, before sign-in is turned on:** shifts are saved in your browser on that device only. Nothing is sent to a server. Clearing your browser data or using private browsing will remove them, so use **Back up all data** on the Timesheet tab now and then. Use **Restore from backup** to move your shifts to another device.
- **Inside Claude (as an artifact):** shifts are saved to your Claude account and are private to you.

## Publishing with GitHub Pages

In the repository, go to **Settings → Pages**. Set **Source** to **Deploy from a branch**, pick the branch that has `index.html`, choose the `/ (root)` folder, and click **Save**. The site appears at `https://<username>.github.io/ShiftBook/` after a minute or two.

## Turning on sign-in

Sign-in uses [Firebase Authentication](https://firebase.google.com/docs/auth). Until it's set up, the website keeps working in device-only mode.

1. Go to [console.firebase.google.com](https://console.firebase.google.com), sign in with your Google account and click **Create a project**. Name it `Shiftbook`. You can turn Google Analytics off.
2. Go to **Build → Authentication → Get started**. Under **Sign-in method**, turn on:
   - **Google**: pick a support email and save.
   - **Email/Password**: turn on the first switch only and save.
   - **Phone**: save. Firebase may ask you to move to the pay-as-you-go **Blaze** plan for text messages, which are charged per text.
3. Still in Authentication, go to **Settings → Authorised domains → Add domain** and add `kinganalytics74.github.io`.
4. Go to **Build → Firestore Database → Create database**. Choose **production mode** and a nearby location (for example `europe-west2`, London). Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
5. Go to **Project settings** (the gear icon) → **Your apps** → the **Web** icon `</>`, register an app called `Shiftbook web`, and copy the `apiKey`, `authDomain`, `projectId` and `appId` values.
6. In `index.html`, find `const FIREBASE_CONFIG` and paste those four values in. Commit, and the website shows the sign-in screen within a minute or two.

The Firebase web config is meant to be public. Your data is protected by the sign-in and the Firestore rules, not by keeping the config secret.

To move shifts you already logged in device-only mode into your new account, tap **Back up all data** on the Timesheet tab *before* you add the Firebase config. After you've signed in, tap **Restore from backup** and choose that file.

---

Powered by **WesTech Innovation**
