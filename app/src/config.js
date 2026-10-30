/*
 * config.js — settings for your Shiftbook deployment.
 *
 * Leave supabaseUrl and supabaseAnonKey empty to run in DEMO MODE: sign-in codes are shown
 * on screen and data stays in this browser. Fill them in to use real accounts and cloud sync.
 * Both values are in Supabase → Project Settings → API. The anon key is safe to publish:
 * row-level security in supabase/schema.sql stops anyone reading another person's data.
 */
window.SHIFTBOOK_CONFIG = {
  supabaseUrl: "",          // e.g. "https://abcdefgh.supabase.co"
  supabaseAnonKey: "",      // the "anon public" key
  signIn: {
    phone: true,            // code by text message (needs an SMS provider such as Twilio set up in Supabase)
    email: true,            // code by email
    password: true,         // email and password (Supabase → Authentication → Providers → Email, on by default)
    google: false,          // turn on after adding Google in Supabase → Authentication → Providers
    apple: false            // turn on after adding Apple in Supabase → Authentication → Providers
  },
  defaultCountryCode: "+44" // used when someone types a UK number like 07700 900123
};
