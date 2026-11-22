// Shift names people type themselves at sign-up (and the two that are always there).
// Waking night is paid by the hour; Sleep-in is paid as a sleep-in (a set amount), not by the hour.
export const FIXED_SHIFTS = ["Waking night", "Sleep-in"];
export const MAX_SHIFTS = 12;

// Tidy a typed name: single spaces, no spaces at the ends, capital first letter, at most 30 characters.
export function cleanShiftName(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 30).trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

// Check a typed name against the shifts already added. Returns { name } or { error }.
export function checkShiftName(raw, existing = []) {
  const name = cleanShiftName(raw);
  if (!name) return { error: "Type a shift name first." };
  if (!/[A-Za-z0-9]/.test(name)) return { error: "Use letters or numbers in the shift name." };
  const same = [...existing, ...FIXED_SHIFTS].find(x => x.toLowerCase() === name.toLowerCase());
  if (same) return { error: `${same} is already in your list.` };
  if (existing.length >= MAX_SHIFTS) return { error: `You can add up to ${MAX_SHIFTS} shifts. Remove one first.` };
  return { name };
}

// How a shift is paid: Sleep-in and Waking night are set; for their own shifts people choose
// "hours" (by the hour) or "both" (paid hours, then a sleep-in).
export function paidFor(name, chosen) {
  if (name === "Sleep-in") return "sleep";
  if (name === "Waking night") return "hours";
  return chosen === "both" ? "both" : "hours";
}

// Care or other work, from what people type about their job. Blank counts as care (most users).
export function workKind(text) {
  const t = String(text || "").trim();
  if (!t) return "care";
  return /\b(care|carer|carers|caring|support|nurse|nursing|health|hca|domiciliary|residential|hospital|hospice|disabilit(y|ies))\b/i.test(t) ? "care" : "other";
}
