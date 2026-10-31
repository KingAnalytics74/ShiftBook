import { ymd } from "./dates.js";
import { daysIn } from "./periods.js";

// PAY RULES: net hours = day hours - break; pay = net hours x hourlyRate + (sleepIn ? sleepInRate : 0)
// cfg is the user's settings ({ hourlyRate, sleepInRate }); todayStr is "YYYY-MM-DD".
export function calc(s, cfg, todayStr) {
    const day = Number(s.dayHours) || 0, brk = Number(s.breakHrs) || 0;
    const net = s.dayHours == null || s.dayHours === "" ? 0 : Math.max(0, day - brk);
    const hourly = net * cfg.hourlyRate;
    const sleep = s.sleepIn ? cfg.sleepInRate : 0;
    return { net, hourly, sleep, total: hourly + sleep, status: s.date > todayStr ? "Rostered" : "Worked" };
}

// shifts is a Map of "YYYY-MM-DD" -> shift. Returns every day of the period plus totals.
export function summarise(p, shifts, cfg, todayStr) {
    const rows = daysIn(p).map(d => { const k = ymd(d); const s = shifts.get(k); return { date: d, key: k, s, c: s ? calc(s, cfg, todayStr) : null }; });
    const t = { gross: 0, hourly: 0, sleep: 0, net: 0, sleepIns: 0, shifts: 0, worked: 0, rostered: 0, dayHours: 0, breaks: 0, fares: 0, fareShifts: 0 };
    rows.forEach(r => { if (!r.c) return; t.shifts++; t.gross += r.c.total; t.hourly += r.c.hourly; t.sleep += r.c.sleep; t.net += r.c.net; t.dayHours += Number(r.s.dayHours) || 0; t.breaks += Number(r.s.breakHrs) || 0; if (Number(r.s.fare) > 0) { t.fares += Number(r.s.fare); t.fareShifts++; } if (r.s.sleepIn) t.sleepIns++; if (r.c.status === "Worked") t.worked += r.c.total; else t.rostered += r.c.total; });
    const weeks = [];
    rows.forEach((r, i) => { const w = Math.floor(i / 7); weeks[w] ||= { from: r.date, to: r.date, hourly: 0, sleep: 0, shifts: 0, net: 0 }; weeks[w].to = r.date; if (r.c) { weeks[w].hourly += r.c.hourly; weeks[w].sleep += r.c.sleep; weeks[w].shifts++; weeks[w].net += r.c.net; } });
    const users = new Map();
    rows.forEach(r => { if (!r.s) return; (r.s.users || []).forEach(u => { const x = users.get(u) || { shifts: 0, sleeps: 0, net: 0 }; x.shifts++; if (r.s.sleepIn) x.sleeps++; x.net += r.c.net; users.set(u, x); }); });
    return { rows, t, weeks, users };
}