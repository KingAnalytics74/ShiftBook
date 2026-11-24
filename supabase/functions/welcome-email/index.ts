// welcome-email — sends one "Welcome to Shiftbuck" email to a new account.
//
// The app calls this once after someone signs in (src/auth.js). It:
//   1. checks who is calling from their sign-in token (no token, no email),
//   2. skips accounts more than 2 days old, so existing users never get it out of the blue,
//   3. skips anyone already welcomed (app_metadata.welcome_sent_at, which only the server can set),
//   4. sends the email through Resend and records that it was sent.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   from resend.com → API Keys (required; without it the function does nothing)
//   WELCOME_FROM     optional, default "Shiftbuck <hello@shiftbuck.com>" (the domain must be verified in Resend)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
//
// Deploy: supabase functions deploy welcome-email   (keep "Verify JWT" on)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { welcomeHtml, welcomeText } from "./template.ts";

const ORIGINS = ["https://shiftbuck.com", "https://www.shiftbuck.com"];
const NEW_FOR_MS = 2 * 24 * 3600 * 1000;

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const h = { ...cors(req), "Content-Type": "application/json" };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: h });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return reply({ sent: false, reason: "not-set-up" });

  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return reply({ error: "not signed in" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: got, error: uErr } = await admin.auth.getUser(jwt);
  const user = got?.user;
  if (uErr || !user) return reply({ error: "not signed in" }, 401);

  if (!user.email) return reply({ sent: false, reason: "no-email" });
  if (user.app_metadata?.welcome_sent_at) return reply({ sent: false, reason: "already" });
  if (Date.now() - new Date(user.created_at).getTime() > NEW_FOR_MS) return reply({ sent: false, reason: "not-new" });

  // mark first, so two calls at once can't send two emails; undo if the send fails
  const meta = { ...(user.app_metadata || {}) };
  const mark = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...meta, welcome_sent_at: new Date().toISOString() } });
  if (mark.error) return reply({ error: "couldn't record" }, 500);

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("WELCOME_FROM") || "Shiftbuck <hello@shiftbuck.com>",
      to: [user.email],
      subject: "Welcome to Shiftbuck",
      html: welcomeHtml(),
      text: welcomeText(),
    }),
  });
  if (!r.ok) {
    await admin.auth.admin.updateUserById(user.id, { app_metadata: meta });
    console.error("resend", r.status, await r.text());
    return reply({ sent: false, reason: "send-failed" }, 502);
  }
  return reply({ sent: true });
});
