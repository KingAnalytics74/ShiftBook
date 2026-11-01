import { ymd, parse, addDays } from "./dates.js";

// Day-level guide based on UK Working Time Regulations: 24h off in every 7 days,
// 11 hours' rest between shifts, 48h a week. Shifts with start and finish times are checked
// for the 11-hour gap; shifts without times use the day-level approximations only.
export const REST = { amberRun: 6, redRun: 7, amberHrs: 40, redHrs: 48, gap: 11 };

// "HH:MM" -> minutes after midnight
export const toMin = t => { const [a, b] = String(t || "0:0").split(":").map(Number); return a * 60 + (b || 0); };
// The clock span of a shift with times, in ms. A finish at or before the start is the next day.
export function spanOf(s) {
    if (!s || !s.start || !s.end || !s.date) return null;
    const day = parse(s.date).getTime();
    const st = day + toMin(s.start) * 6e4; let en = day + toMin(s.end) * 6e4;
    if (en <= st) en += 864e5;
    return { st, en };
}
// An hourly shift that starts in the evening or runs past midnight (not a sleep-in).
export const isNight = s => !!(s && s.start && s.end && !s.sleepIn && (toMin(s.start) >= 18 * 60 || toMin(s.end) <= toMin(s.start)));

export const hasDayHrs = s => !!s && s.dayHours != null && s.dayHours !== "" && Number(s.dayHours) > 0;
export function worked(s) { return !!s && (!!s.sleepIn || hasDayHrs(s)); }

// Hours worked in the 7 days ending on day d. m is a Map of "YYYY-MM-DD" -> shift.
export function hours7(d, m) {
    let h = 0;
    for (let i = 0; i < 7; i++) { const s = m.get(ymd(addDays(d, -i))); if (hasDayHrs(s)) h += Math.max(0, Number(s.dayHours) - (Number(s.breakHrs) || 0)); }
    return Math.round(h * 10) / 10;
}

// Rest status for one day: level is "off" | "ok" | "amber" | "red".
export function restDay(key, m) {
    const d = parse(key), s = m.get(key), hrs = hours7(d, m);
    if (!worked(s)) return { level: "off", run: 0, hrs7: hrs, reasons: [] };
    let run = 0; for (let k = d; worked(m.get(ymd(k))) && run < 90; k = addDays(k, -1)) run++;
    const prev = m.get(ymd(addDays(d, -1)));
    const reasons = []; let level = "ok";
    const up = l => { if (l === "red" || (l === "amber" && level === "ok")) level = l; };
    if (run >= REST.redRun) { up("red"); reasons.push(`${run} days in a row without a day off`); }
    else if (run >= REST.amberRun) { up("amber"); reasons.push(`${run} days in a row, so the next day should be off`); }
    if (hrs > REST.redHrs) { up("red"); reasons.push(`${hrs} hours worked in the last 7 days, over 48`); }
    else if (hrs > REST.amberHrs) { up("amber"); reasons.push(`${hrs} hours worked in the last 7 days`); }
    if (prev && prev.sleepIn && hasDayHrs(prev) && hasDayHrs(s)) { up("red"); reasons.push("day shift, sleep-in, then another day shift: about 36 hours on duty"); }
    else if (prev && prev.sleepIn && hasDayHrs(s)) { up("amber"); reasons.push("straight from a sleep-in onto a day shift"); }
    else {
        const a = spanOf(prev), b = spanOf(s);
        if (a && b) {
            const gap = (b.st - a.en) / 36e5;
            if (gap >= 0 && gap < REST.gap) { up("amber"); reasons.push(gap < 0.5 ? "straight from one shift into the next, with no rest in between" : `only ${String(Math.round(gap * 4) / 4)} hours off between shifts, under the 11-hour minimum`); }
        }
    }
    return { level, run, hrs7: hrs, reasons };
}