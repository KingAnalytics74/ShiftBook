import { ymd, parse, addDays } from "./dates.js";
import { hasDayHrs, worked } from "./restCheck.js";

// Predicts the next 7 days from the last 8 weeks: how often each weekday was worked,
// the most common shift type on that weekday, and the usual hours, break and service users.
export const FC_WEEKS = 8;
export const shiftKind = s => s.sleepIn && hasDayHrs(s) ? "Day + sleep-in" : s.sleepIn ? "Sleep-in" : "Day shift";
const medianOf = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
const modeOf = a => { const m = new Map(); a.forEach(x => m.set(x, (m.get(x) || 0) + 1)); let best = null, n = 0; m.forEach((v, k) => { if (v > n) { n = v; best = k; } }); return best; };

// shifts: Map of "YYYY-MM-DD" -> shift. todayStr: "YYYY-MM-DD". calcFn: (shift) => { total, ... } (the pay rule).
export function forecast(shifts, todayStr, calcFn) {
    const today = parse(todayStr);
    const past = [...shifts.values()].filter(s => s.date < todayStr && worked(s));
    if (!past.length) return { days: [], basis: 0, weeks: 0 };
    const first = parse(past.map(s => s.date).sort()[0]);
    const from = first > addDays(today, -7 * FC_WEEKS) ? first : addDays(today, -7 * FC_WEEKS);
    const inWin = past.filter(s => parse(s.date) >= from);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = addDays(today, i), key = ymd(d), wd = d.getDay();
        let seen = 0; for (let x = from; x < today; x = addDays(x, 1)) if (x.getDay() === wd) seen++;
        const hits = inWin.filter(s => parse(s.date).getDay() === wd);
        const p = seen ? hits.length / seen : 0, existing = shifts.get(key);
        let guess = null;
        if (hits.length) {
            const kind = modeOf(hits.map(shiftKind)), same = hits.filter(s => shiftKind(s) === kind), dayOnes = same.filter(hasDayHrs);
            guess = {
                date: key, users: (modeOf(same.map(s => (s.users || []).join("|"))) || "").split("|").filter(Boolean), sleepIn: kind !== "Day shift",
                dayHours: dayOnes.length ? medianOf(dayOnes.map(s => Number(s.dayHours))) : null, breakHrs: dayOnes.length ? medianOf(dayOnes.map(s => Number(s.breakHrs) || 0)) : null, notes: ""
            };
        }
        days.push({ d, key, p, existing, guess, pay: existing ? calcFn(existing).total : guess ? calcFn(guess).total : 0 });
    }
    return { days, basis: inWin.length, weeks: Math.max(1, Math.round((today - from) / 6048e5)) };
}