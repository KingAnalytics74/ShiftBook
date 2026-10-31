# Decisions log
- 2026-10-30: Moved code into app/src/. Supabase migration proposed, awaiting sign-off.
- 2026-10-30: Full Shiftbook app (sign-in, community, messages, bus fares, terms, desktop side menu) added in app/, built on the app/src structure. Previous app moved to legacy-app/. Supabase schema in supabase/schema.sql proposed for founder and Data Analyst sign-off.
- 2026-10-30: Added email and password sign-in alongside codes, Google and Apple (config `signIn.password`, on by default). Supabase Auth stores the password hash; no database change. Privacy notice updated to list sign-in details.
- 2026-10-30: 'Continue with Google' shown by default (config `signIn.google`); footer 'WesTech Innovation' links to westechinnovation.com.
- 2026-10-31: Security pass. Database (needs Data Analyst sign-off): `community_post` now always uses the poster's own profile nickname and area, and documents are capped at 256 KB. Browser: Content Security Policy, referrer policy and a clickjacking guard (`app/src/guard.js`) on every page; CSV cells safe from Excel formula injection. Removed the `experiments/` page from the live site (it's still in git history). See SECURITY.md.
