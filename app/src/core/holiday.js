// Holiday (annual leave) for UK shift workers. Pure functions, no screen code.
//
// THE RULES (England, Scotland and Wales; Northern Ireland has its own):
//   Everyone gets at least 5.6 weeks of paid holiday a year, capped at 28 days for 5 or more days a week.
//   Irregular-hours and part-year workers (leave years from 1 April 2024) build it up as they work:
//     holiday hours = hours worked in each pay period x 12.07%, rounded to the nearest whole hour.
//     12.07% = 5.6 weeks / (52 - 5.6) weeks worked. A contract with more holiday uses weeks / (52 - weeks).
//   Workers on the same days each week get 5.6 x days per week (max 28 days) for the year,
//     building up 1/12 a month in their first year.
//   Rolled-up holiday pay (irregular and part-year only): 12.07% of pay added to every payslip instead.
//   Holiday pay is the average pay over the last 52 weeks with pay (up to 104 weeks back), Sunday to Saturday weeks.
//
// hol (the user's holiday settings, all optional):
//   { mode: "irregular" | "regular" | "rolledup", startMonth: 1-12, startDay: 1-31, weeks: 5.6, daysPerWeek, hoursPerDay,
//     contractDays (days a year when the contract gives a fixed number), sleepIns: "no" | "payroll",
//     carriedHours, joined: "YYYY-MM-DD" (started the job during this leave year) }

import { ymd, parse, addDays } from "./dates.js";
import { calc } from "./pay.js";

export const STATUTORY_WEEKS = 5.6;
export const MAX_STATUTORY_DAYS = 28;

// 5.6 weeks -> 0.1207 (12.07%); 6 weeks -> 0.1304
export const accrualRate = (weeks = STATUTORY_WEEKS) => {
    const w = Math.min(Math.max(Number(weeks) || STATUTORY_WEEKS, STATUTORY_WEEKS), 20);
    return Math.round(w / (52 - w) * 10000) / 10000;
};

// The leave year containing date d. Leave years start on any day: 1 January, 1 April,
// 6 April, the day someone started the job... startMonth is 1-12, startDay 1-31
// (a day the month doesn't have, like 31 in a 30-day month, means its last day).
const yearStart = (y, m, day) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
export function leaveYear(d, startMonth = 1, startDay = 1) {
    const m = Math.min(Math.max(Math.round(Number(startMonth) || 1), 1), 12) - 1;
    const day = Math.min(Math.max(Math.round(Number(startDay) || 1), 1), 31);
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let y = t.getFullYear();
    if (t < yearStart(y, m, day)) y -= 1;
    const start = yearStart(y, m, day), end = addDays(yearStart(y + 1, m, day), -1);
    return { start, end, startKey: ymd(start), endKey: ymd(end) };
}

// Hours from one shift that build up holiday: paid hours after breaks, plus the sleep-in
// turned into hours when the employer pays it that way (sleep-in pay / hourly rate).
export function hoursCounted(s, cfg, hol = {}) {
    const c = calc(s, cfg, "9999-12-31");
    const rate = Number(s.rate) > 0 ? Number(s.rate) : Number(cfg.hourlyRate) || 0;
    const sleep = s.sleepIn && hol.sleepIns === "payroll" && rate > 0 ? (Number(cfg.sleepInRate) || 0) / rate : 0;
    return c.net + sleep;
}

// Holiday built up by an irregular-hours worker in one leave year, pay period by pay period.
// periodFor(date, k) gives the pay period ({start, end}) for a date, as the app already does.
// Only shifts on or before today count. Each period's holiday is rounded to the nearest hour.
export function irregularEarned(shifts, cfg, hol, year, todayStr, periodFor) {
    const rate = accrualRate(hol.weeks);
    const periods = new Map();
    for (const [k, s] of shifts) {
        if (k < year.startKey || k > year.endKey || k > todayStr) continue;
        const p = periodFor(parse(k)), pk = ymd(p.start);
        const x = periods.get(pk) || { start: p.start, end: p.end, hours: 0 };
        x.hours += hoursCounted(s, cfg, hol);
        periods.set(pk, x);
    }
    const rows = [...periods.values()].sort((a, b) => a.start - b.start).map(x => ({ ...x, holiday: Math.round(x.hours * rate) }));
    const hours = rows.reduce((t, r) => t + r.hours, 0);
    return { rate, rows, hoursWorked: hours, earned: rows.reduce((t, r) => t + r.holiday, 0) };
}

// Days a year for someone on the same days every week. contractDays wins when the contract gives more.
export function regularDaysPerYear(hol = {}) {
    const dpw = Math.min(Math.max(Number(hol.daysPerWeek) || 5, 0.5), 7);
    const statutory = Math.min(Math.round(STATUTORY_WEEKS * dpw * 100) / 100, MAX_STATUTORY_DAYS);
    const weeks = Number(hol.weeks) > STATUTORY_WEEKS ? Math.round(Number(hol.weeks) * dpw * 100) / 100 : 0;
    return Math.max(statutory, Number(hol.contractDays) || 0, weeks);
}

// Whole months from joining to the end of the leave year (for someone who starts part-way through).
const monthsLeft = (joined, year) => {
    const j = parse(joined);
    if (j <= year.start) return 12;
    return Math.max(0, (year.end.getFullYear() - j.getFullYear()) * 12 + (year.end.getMonth() - j.getMonth()) + 1);
};

// Regular hours: the year's entitlement, and how much has built up so far in a first year.
export function regularEntitlement(hol, year, todayStr) {
    const perDay = Number(hol.hoursPerDay) || 0;
    const days = regularDaysPerYear(hol);
    const firstYear = hol.joined && hol.joined > year.startKey && hol.joined <= year.endKey;
    const months = firstYear ? monthsLeft(hol.joined, year) : 12;
    // the year's share, rounded up to the nearest half day
    const yearDays = firstYear ? Math.ceil(days * months / 12 * 2) / 2 : days;
    // built up so far in a first year: 1/12 for each month started since joining
    let soFar = yearDays;
    if (firstYear) {
        const t = parse(todayStr), j = parse(hol.joined);
        const done = Math.max(0, Math.min(months, (t.getFullYear() - j.getFullYear()) * 12 + (t.getMonth() - j.getMonth()) + 1));
        soFar = Math.round(days * done / 12 * 2) / 2;
    }
    return { days: yearDays, hours: yearDays * perDay, soFarDays: soFar, soFarHours: soFar * perDay, firstYear: !!firstYear };
}

// Holiday taken (before today) and booked (today or later) in the leave year, in hours.
// holidays is a Map or array of { from, to, hours }.
export function usedHours(holidays, year, todayStr) {
    let taken = 0, booked = 0;
    for (const h of holidays instanceof Map ? holidays.values() : holidays) {
        if (!h || !h.from || h.from > year.endKey || (h.to || h.from) < year.startKey) continue;
        const n = Number(h.hours) || 0;
        if ((h.to || h.from) < todayStr) taken += n; else booked += n;
    }
    return { taken, booked };
}

// Average pay over the last 52 Sunday-to-Saturday weeks that had pay, looking back up to 104 weeks.
// Returns the average week's pay, pay per hour counted, and how many weeks it used.
export function holidayPayRate(shifts, cfg, hol, todayStr) {
    const today = parse(todayStr);
    const sunday = addDays(today, -today.getDay()); // the Sunday that starts this week; this week isn't finished, so skip it
    const weeks = [];
    for (let w = 1; w <= 104 && weeks.length < 52; w++) {
        const from = addDays(sunday, -7 * w);
        let pay = 0, hours = 0;
        for (let i = 0; i < 7; i++) {
            const k = ymd(addDays(from, i)), s = shifts.get(k);
            if (!s) continue;
            pay += calc(s, cfg, todayStr).total;
            hours += hoursCounted(s, cfg, { ...hol, sleepIns: "payroll" });
        }
        if (pay > 0) weeks.push({ from, pay, hours });
    }
    const pay = weeks.reduce((t, w) => t + w.pay, 0), hours = weeks.reduce((t, w) => t + w.hours, 0);
    return { weeks: weeks.length, weekly: weeks.length ? pay / weeks.length : 0, perHour: hours ? pay / hours : Number(cfg.hourlyRate) || 0 };
}

// Rolled-up holiday pay: 12.07% of pay, rounded to the penny.
export const rolledUp = (gross, weeks) => Math.round(gross * accrualRate(weeks) * 100) / 100;

// Everything the Holiday screen shows, in hours.
export function holidaySummary({ shifts, holidays, cfg, hol = {}, todayStr, periodFor }) {
    const year = leaveYear(parse(todayStr), hol.startMonth || 1, hol.startDay || 1);
    const mode = hol.mode || "irregular";
    const carried = Math.max(0, Number(hol.carriedHours) || 0);
    const used = usedHours(holidays || [], year, todayStr);
    const pay = holidayPayRate(shifts, cfg, hol, todayStr);
    const out = { mode, year, carried, ...used, pay, rate: accrualRate(hol.weeks) };
    if (mode === "regular") {
        const e = regularEntitlement(hol, year, todayStr);
        Object.assign(out, { entitlement: e, earned: e.soFarHours, yearTotal: e.hours });
    } else {
        const ir = irregularEarned(shifts, cfg, hol, year, todayStr, periodFor);
        // by the end of the leave year, if the next weeks look like the last 12
        const back = addDays(parse(todayStr), -84);
        let recent = 0;
        for (const [k, s] of shifts) if (k > ymd(back) && k <= todayStr && k >= year.startKey) recent += hoursCounted(s, cfg, hol);
        const weeksRecent = Math.min(12, Math.max(1, (parse(todayStr) - Math.max(back, year.start)) / 6048e5));
        const weeksLeft = Math.max(0, (year.end - parse(todayStr)) / 6048e5);
        const projected = ir.earned + Math.round(recent / weeksRecent * weeksLeft * ir.rate);
        Object.assign(out, { irregular: ir, earned: ir.earned, yearTotal: projected });
        if (mode === "rolledup") {
            let gross = 0;
            for (const [k, s] of shifts) if (k >= year.startKey && k <= todayStr) gross += calc(s, cfg, todayStr).total;
            out.rolled = { grossYear: gross, yearPay: rolledUp(gross, hol.weeks) };
        }
    }
    out.left = out.carried + out.earned - out.taken - out.booked;
    return out;
}

// UK bank holidays: England and Wales, Scotland, Northern Ireland (2026 and 2027).
export const BANK_HOLIDAYS = {
    ew: ["2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
        "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28"],
    sc: ["2026-01-01", "2026-01-02", "2026-04-03", "2026-05-04", "2026-05-25", "2026-08-03", "2026-11-30", "2026-12-25", "2026-12-28",
        "2027-01-01", "2027-01-04", "2027-03-26", "2027-05-03", "2027-05-31", "2027-08-02", "2027-11-30", "2027-12-27", "2027-12-28"],
    ni: ["2026-01-01", "2026-03-17", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-07-13", "2026-08-31", "2026-12-25", "2026-12-28",
        "2027-01-01", "2027-03-17", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-07-12", "2027-08-30", "2027-12-27", "2027-12-28"]
};
export const bankHolidaysIn = (year, nation = "ew") => (BANK_HOLIDAYS[nation] || BANK_HOLIDAYS.ew).filter(k => k >= year.startKey && k <= year.endKey);
