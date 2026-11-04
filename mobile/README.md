# ShiftBook Mobile

The Android launcher label is `ShiftBook`. Its launcher icons use the existing
ShiftBook logo at `../ShiftBook/app/favicon.svg`; Android density and adaptive
icon resources are under `android/app/src/main/res`.

The Flutter app uses the same Supabase project, authentication, and `documents`
table as the Shiftbuck website. Its defaults are already configured with the
website's project URL and client-safe publishable key, so no additional setup is
needed to share accounts and data:

```powershell
flutter run
```

For a debug Android APK:

```powershell
flutter build apk --debug
```

Never put a Supabase service-role key in the mobile application. Account
deletion uses the existing `delete_my_account` Supabase RPC used by the
website. CSV exports and full JSON backups are shared/saved through the
platform's native share sheet.

The app reads and writes the website's existing document paths under
`data/users/<user-id>/`, including profile, money settings, shifts, spending,
and payslips. Keep the existing row-level security policies enabled.

To override the defaults for a different build environment, pass
`--dart-define=SUPABASE_URL=...` and
`--dart-define=SUPABASE_PUBLISHABLE_KEY=...`; use the website's same project
values when you want shared sign-in and data. `SUPABASE_ANON_KEY` remains a
supported legacy override.

## Authentication setup

The app opens Google sign-in in the device browser and returns through the
`com.example.mobile://login-callback` deep link. Android and iOS are configured
for this callback, and Supabase Flutter uses PKCE with persisted sessions.
Register `com.example.mobile://login-callback` under **Supabase → Authentication
→ URL Configuration → Redirect URLs**. The website callback URLs must also be
allowed there: `https://shiftbuck.com/app/` and
`https://www.shiftbuck.com/app/`.

The project currently reports email sign-in enabled, signup enabled, and
Google sign-in disabled. Its email template and SMTP configuration are not
visible through the public client API, and email delivery has not been tested.
In **Supabase → Authentication → Email Templates**, check **Confirm signup**
and **Magic Link**: the default templates may send links. To use numeric codes,
configure the relevant templates to show `{{ .Token }}`. The app accepts either
a numeric verification code or a confirmation/sign-in link.

In **Supabase → Authentication → SMTP Settings**, verify a working sender and
SMTP host, credentials, and sender address. A successful API response only
means Supabase accepted the request; it does not confirm delivery.

To enable Google, open **Supabase → Authentication → Providers → Google**, add
the OAuth client ID and secret from Google Cloud, and enable the provider. In
Google Cloud, create a Web OAuth client and add this exact authorized redirect
URI: `https://dfejgtomnabnpychtpcs.supabase.co/auth/v1/callback`. Do not put
Google or Supabase secrets in the app. No Google credentials are configured by
this change.
