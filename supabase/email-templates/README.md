# Shiftbuck emails

Supabase sends these emails, so the look is set in the Supabase dashboard, not in the app.

1. Open Supabase, then **Authentication**, then **Emails** (older dashboards: **Email Templates**).
2. For each template below, set the **Subject**, then paste the whole file into **Message body** and save.

| Supabase template | File | Subject |
|---|---|---|
| Magic Link (the sign-in code) | `magic-link.html` | Your Shiftbuck sign-in code |
| Confirm signup | `confirm-signup.html` | Confirm your Shiftbuck account |
| Reset Password | `recovery.html` | Reset your Shiftbuck password |
| Reauthentication | `reauthentication.html` | Your Shiftbuck confirmation code |

The logo is `https://shiftbuck.com/app/email-logo.png`, so the logo only appears after this folder has been deployed.

## How long the code works

The emails say the code works for one hour. That is set in Supabase, not in the app:
**Authentication**, **Sign In / Providers**, **Email**, **Email OTP Expiration**. Set it to `3600` (seconds) to match the emails.
The maximum is 86400 (24 hours). If you change it, change the wording in the templates too.
