/*
 * config.js — settings for your Shiftbuck deployment.
 *
 * Leave supabaseUrl and supabaseAnonKey empty to run in DEMO MODE: sign-in codes are shown
 * on screen and data stays in this browser. Fill them in to use real accounts and cloud sync.
 * Both values are in Supabase → Project Settings → API. The anon key is safe to publish:
 * row-level security in supabase/schema.sql stops anyone reading another person's data.
 */
window.SHIFTBOOK_CONFIG = {
  supabaseUrl: "https://dfejgtomnabnpychtpcs.supabase.co",          // e.g. "https://abcdefgh.supabase.co" (a custom Supabase domain also needs adding to connect-src in index.html)
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZWpndG9tbmFibnB5Y2h0cGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzODEyMjUsImV4cCI6MjEwODk1NzIyNX0.bdhCQTRFPuntcFyYpHXnDpGs-szqNs5tzFUCqowDyfQ", // the "anon public" key (safe to publish)
  signIn: {
    phone: false,           // code by text message (needs an SMS provider such as Twilio set up in Supabase)
    email: true,            // code by email
    password: true,         // email and password (Supabase → Authentication → Providers → Email, on by default)
    google: true,           // "Continue with Google": add Google in Supabase → Authentication → Providers (until then it says it isn't switched on yet)
    apple: false            // turn on after adding Apple in Supabase → Authentication → Providers
  },
  defaultCountryCode: "+44" // used when someone types a UK number like 07700 900123
};
