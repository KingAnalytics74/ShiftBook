// A run of back-to-back shifts, picked in order (up to 4), turned into the records Shiftbuck saves.
// Shiftbuck keeps one shift per date, so picks that start on the same date join into one record:
// a day followed by a sleep-in becomes a "Day + Sleep-in" shift; two hours shifts become one longer day.
// Each pick starts at its own start time, at or after the previous pick ends.

export const RUN_MAX = 4;

const toMin = t => { const [h, m] = String(t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const spanMin = (a, b) => { let m = toMin(b) - toMin(a); if (m <= 0) m += 1440; return m; };
const spanHrs = (a, b) => Math.round(spanMin(a, b) / 15) / 4;

// Paid hours for one shift type: none for a sleep-in, the set hours for a combined type, else start to finish.
export const runTypeHours = t => t.paid === "sleep" ? null : t.paid === "both" ? (Number(t.hours) || 0) : spanHrs(t.start, t.end);

export function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// date: "YYYY-MM-DD" of the first shift. picks: shift types in the order worked.
// Returns { records } or { error } when two picks can't share a date.
export function buildRun(date, picks) {
  const records = [];
  let cursor = null;
  for (const t of picks) {
    if (!t || !t.start || !t.end) return { error: "Each shift in the run needs a start and finish time." };
    const s = toMin(t.start);
    const k = cursor == null ? 0 : Math.max(0, Math.ceil((cursor - s) / 1440));
    const start = k * 1440 + s, end = start + spanMin(t.start, t.end), d = addDays(date, k);
    const h = runTypeHours(t), brk = t.paid === "sleep" ? 0 : Number(t.breakHrs) || 0;
    const last = records[records.length - 1];
    if (last && last.date === d) {
      if (last.sleepIn || t.paid === "both") return { error: `${t.name} can't follow ${last.type} on the same day.` };
      last.type += " + " + t.name;
      last.end = t.end;
      if (t.paid === "sleep") last.sleepIn = true;
      else { last.dayHours += h; last.breakHrs += brk; }
    } else {
      records.push({ date: d, type: t.name, start: t.start, end: t.end, sleepIn: t.paid !== "hours", dayHours: h, breakHrs: h == null ? null : brk });
    }
    cursor = end;
  }
  return { records };
}

// What the run pays: each pick's paid hours (less its break) at its own rate or the usual rate, plus the sleep-in rate.
export function runPay(picks, rate, sleepRate) {
  return picks.reduce((sum, t) => {
    const h = runTypeHours(t), r = Number(t.rate) > 0 ? Number(t.rate) : Number(rate) || 0;
    return sum + (h == null ? 0 : Math.max(0, h - (Number(t.breakHrs) || 0)) * r) + (t.paid === "hours" ? 0 : Number(sleepRate) || 0);
  }, 0);
}
