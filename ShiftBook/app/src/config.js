/*
 * config.js — settings for your Shiftbuck deployment.
 *
 * Leave supabaseUrl and supabaseAnonKey empty to run in DEMO MODE: sign-in codes are shown
 * on screen and data stays in this browser. The values below connect to the existing shared
 * ShiftBook Supabase project. Its publishable key is safe to use in client-side code:
 * row-level security in supabase/schema.sql stops anyone reading another person's data.
 */
window.SHIFTBOOK_CONFIG = {
  supabaseUrl: "https://dfejgtomnabnpychtpcs.supabase.co",
  supabaseAnonKey: "sb_publishable_OH4vl-EWQUc5Yfr0JUMomg_FEOIqK6n",
  signIn: {
    phone: false,
    email: true,
    password: true,
    google: true,
    apple: false
  },
  defaultCountryCode: "+44"
};
