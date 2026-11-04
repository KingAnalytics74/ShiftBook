# Start here

- The app is in `app/`. Open `app/index.html` with VS Code Live Server, or run `python3 -m http.server 3000` in the repo root and open http://localhost:3000 (the root page sends you to `app/`).
- With `app/src/config.js` empty, Shiftbuck runs in **demo mode**: data is stored in this browser (localStorage). Fill in the **test** Supabase project's URL and anon key there to use real accounts. There is no build step, so a `.env` file isn't read by the app; `.env.example` lists the same two values for reference.
- Read `CONTRIBUTING.md` before your first change and pick a task from `docs/first-issues.md`.
- Branch conventions: feature/<name>-<what>, fix/<name>-<what>. PR required for merges.
- No schema or database changes without founder and Data Analyst sign-off.
- `legacy-app/` is the earlier single-user version, kept for reference until the team agrees to remove it.
