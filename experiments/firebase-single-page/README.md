# Experiment: single-page Shiftbook with Firebase sign-in

Not the live app. The live app is in [`app/`](../../app/) and uses Supabase.

This folder keeps an earlier single-file version of Shiftbook that adds:

- **Sign-in with Firebase:** Google, email and password (with reset), or a mobile number with a text code. Until `FIREBASE_CONFIG` in `index.html` is filled in, the page runs in device-only mode and saves to the browser.
- **Money borrowed & lent:** records of money borrowed from or lent to people, repayments, what's due and what's overdue. A signed-in person has to confirm it's them (password, Google or a text code) before changing these records, unless they signed in within the last 5 minutes.
- [`firestore.rules`](firestore.rules): each signed-in person can only read and write `data/users/<their uid>/…`.

It's kept here so the ideas (password sign-in, the loans tracker, and the identity check before a money change) can be moved into `app/` on Supabase if the team wants them. It's served at `/experiments/firebase-single-page/` on GitHub Pages but isn't linked from the app.
