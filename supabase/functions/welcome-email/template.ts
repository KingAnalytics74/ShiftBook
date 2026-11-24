// The welcome email. Same look as supabase/email-templates (blue header, Shiftbuck logo, rounded card).
// Keep it short, plain UK English, and never mention anyone the person supports at work.

const APP = "https://shiftbuck.com/app/";

const steps: [string, string][] = [
  ["Log your first shift", "Pick the shift, type the times, and Shiftbuck works out what you should be paid. Add a sleep-in or waking night straight after if you did one."],
  ["Check your payslip", "When payday comes, compare what you were paid with what your shifts add up to, and see your take-home after tax."],
  ["Watch your rest", "Shiftbuck warns you when there's less than 11 hours between shifts, or you've worked over 48 hours in 7 days."],
  ["Plan your money", "Set a budget and keep track of your spending and savings."],
];

export function welcomeHtml(): string {
  const rows = steps.map(([t, d], i) => `
<tr><td style="padding:0 32px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="40" valign="top"><div style="width:30px;height:30px;border-radius:15px;background:#D5EEF8;color:#3E4095;font:700 15px/30px Arial,Helvetica,sans-serif;text-align:center">${i + 1}</div></td>
<td valign="top" style="font:400 15px/1.5 Arial,Helvetica,sans-serif;color:#55587F"><b style="color:#1B1D4E">${t}</b><br>${d}</td>
</tr></table></td></tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Welcome to Shiftbuck</title></head>
<body style="margin:0;padding:0;background:#EDF7FC">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Your shifts, your pay, on your side. Here's how to get started.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDF7FC"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:22px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1B1D4E">
<tr><td align="center" style="background:#3E4095;padding:26px 24px"><img src="https://shiftbuck.com/app/email-logo.png" width="190" alt="Shiftbuck" style="display:block;border:0;height:auto"></td></tr>
<tr><td style="padding:30px 32px 6px"><h1 style="margin:0;font:700 24px/1.25 Arial,Helvetica,sans-serif;color:#1B1D4E">Welcome to Shiftbuck</h1></td></tr>
<tr><td style="padding:8px 32px 22px;font:400 16px/1.55 Arial,Helvetica,sans-serif;color:#55587F">Thanks for joining. Shiftbuck is free, has no ads, and keeps your shifts and pay in one place, so you always know what you're owed. Here's how to get the most from it:</td></tr>
${rows}
<tr><td align="center" style="padding:12px 32px 8px"><a href="${APP}" style="display:inline-block;padding:15px 30px;border-radius:14px;background:#0098DA;color:#0B1340;font:700 16px/1 Arial,Helvetica,sans-serif;text-decoration:none">Open Shiftbuck</a></td></tr>
<tr><td style="padding:18px 32px 30px;font:400 14px/1.55 Arial,Helvetica,sans-serif;color:#55587F">Tip: add Shiftbuck to your home screen so it opens like an app.</td></tr>
<tr><td style="background:#DDF0F9;padding:16px 32px;font:400 12.5px/1.5 Arial,Helvetica,sans-serif;color:#55587F" align="center">Shiftbuck &middot; your shifts, your pay, on your side<br><a href="https://shiftbuck.com" style="color:#3E4095">shiftbuck.com</a><br>You're getting this one-off email because you created a Shiftbuck account.</td></tr>
</table></td></tr></table></body></html>`;
}

export function welcomeText(): string {
  return [
    "Welcome to Shiftbuck",
    "",
    "Thanks for joining. Shiftbuck is free, has no ads, and keeps your shifts and pay in one place, so you always know what you're owed.",
    "",
    ...steps.map(([t, d], i) => `${i + 1}. ${t}: ${d}`),
    "",
    `Open Shiftbuck: ${APP}`,
    "",
    "Tip: add Shiftbuck to your home screen so it opens like an app.",
    "",
    "You're getting this one-off email because you created a Shiftbuck account.",
  ].join("\n");
}
