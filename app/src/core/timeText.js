// Turn a time someone typed into "HH:MM" (24-hour). Returns "" for a blank box and null if it can't be read.
// Understands: 8, 08, 20, 830, 0830, 2030, 8:30, 8.30, 20h30, 8pm, 8:30pm, 8 am, 12am, noon, midnight, 24:00.
export function parseTimeText(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return "";
  if (s === "noon" || s === "midday") return "12:00";
  if (s === "midnight") return "00:00";
  const fmt = (h, m) => (h >= 0 && h <= 23 && m >= 0 && m <= 59) ? String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") : null;
  // 12-hour clock: 8pm, 8:30pm, 830pm, 12am
  let x = s.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)$/);
  if (x) {
    let h = Number(x[1]); const m = Number(x[2] || 0), pm = x[3][0] === "p";
    if (h < 1 || h > 12) return null;
    if (h === 12) h = 0;
    return fmt(pm ? h + 12 : h, m);
  }
  // 8:30, 8.30, 20h30, 24:00
  x = s.match(/^(\d{1,2})[:.h](\d{2})$/);
  if (x) { const h = Number(x[1]), m = Number(x[2]); return h === 24 && m === 0 ? "00:00" : fmt(h, m); }
  // digits only: 8 → 08:00, 20 → 20:00, 830 → 08:30, 2030 → 20:30
  if (/^\d{1,4}$/.test(s)) {
    if (s.length <= 2) { const h = Number(s); return h === 24 ? "00:00" : fmt(h, 0); }
    const h = Number(s.slice(0, s.length - 2)), m = Number(s.slice(-2));
    return h === 24 && m === 0 ? "00:00" : fmt(h, m);
  }
  return null;
}
