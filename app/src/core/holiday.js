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
//   mode: how holiday builds up
//     "irregular" - hours change week to week: 12.07% of hours worked, each pay period
//     "partyear"  - work only part of the year (term-time, seasonal): the same 12.07% method
//     "rolledup"  - 12.07% of pay added to every payslip (irregular and part-year only)
//     "regular"   - same days every week: 5.6 x days a week (max 28), or contractDays
//     "weekly"    - same hours every week: 5.6 x weekly hours (or the contract's weeks x weekly hours)
//     "fixed"     - the employer gives a set amount: annualHours, or annualDays x hoursPerDay
//   startMonth 1-12, startDay 1-31, weeks (5.6+), daysPerWeek, hoursPerDay, weeklyHours, contractDays,
//   annualHours, annualDays, accrue: "upfront" | "monthly" (fixed amounts only), sleepIns: "no" | "payroll",
//   carriedHours, joined / startedJob: "YYYY-MM-DD" (start date), leaving: "YYYY-MM-DD",
//   pattern: [Sun..Sat hours] (a normal week, used to work out holiday on days with no shift logged),
//   bankHols: "separate" | "deduct" (bank holidays come out of the holiday), nation: "ew" | "sc" | "ni",
//   changes: [{ at, text }] (a log of settings changes, shown in the history)

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

export const ANNUAL_MODES = ["regular", "weekly", "fixed"];
export const isAnnual = mode => ANNUAL_MODES.includes(mode);
const r2 = n => Math.round(n * 100) / 100;
const q = n => Math.round(n * 4) / 4; // to the nearest quarter hour

// A normal week from the pattern (Sunday..Saturday hours): total hours and how many days.
export function patternWeek(hol = {}) {
    const p = Array.isArray(hol.pattern) ? hol.pattern.map(n => Math.max(0, Number(n) || 0)) : [];
    const days = p.filter(n => n > 0).length, hours = p.reduce((t, n) => t + n, 0);
    return { days, hours };
}

// Hours in a normal working week, and days a week: from the settings, else the pattern, else days x hours a day.
export function normalWeek(hol = {}) {
    const pw = patternWeek(hol);
    const dpw = Number(hol.daysPerWeek) > 0 ? Number(hol.daysPerWeek) : pw.days || 5;
    const perDay = Number(hol.hoursPerDay) || 0;
    const hours = Number(hol.weeklyHours) > 0 ? Number(hol.weeklyHours) : pw.hours || dpw * perDay;
    return { days: Math.min(Math.max(dpw, 0.5), 7), hours };
}

// The legal minimum for someone on the same pattern every week, in hours:
// 5.6 weeks of their normal week, capped at 28 days for people who work more than 5 days.
export function statutoryHours(hol = {}) {
    const w = normalWeek(hol);
    return r2(STATUTORY_WEEKS * w.hours * Math.min(1, 5 / w.days));
}

// The full year's holiday in hours for the annual modes, split into the legal minimum and the extra the contract gives.
export function annualHours(hol = {}, mode = hol.mode) {
    const perDay = Number(hol.hoursPerDay) || 0, statutory = statutoryHours(hol);
    let hours;
    if (mode === "regular") hours = regularDaysPerYear(hol) * perDay;
    else if (mode === "weekly") {
        const w = normalWeek(hol);
        hours = Math.max(statutory, Number(hol.weeks) > STATUTORY_WEEKS ? Number(hol.weeks) * w.hours : 0);
    } else hours = Number(hol.annualHours) > 0 ? Number(hol.annualHours) : (Number(hol.annualDays) || 0) * perDay;
    hours = r2(hours);
    // a set amount below the legal minimum still gets the legal minimum
    const stat = statutory > 0 ? Math.min(statutory, Math.max(hours, statutory)) : 0;
    return { hours: Math.max(hours, stat), statutory: stat, contractual: r2(Math.max(0, hours - stat)), belowMinimum: stat > hours };
}

// The start date of employment within this leave year, if it's in it.
const startIn = (hol, year) => { const j = hol.joined || hol.startedJob; return j && j > year.startKey && j <= year.endKey ? j : null; };
const leaveIn = (hol, year) => hol.leaving && hol.leaving >= year.startKey && hol.leaving < year.endKey ? hol.leaving : null;
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5) + 1;
const monthsStarted = (from, to) => { const f = parse(from), t = parse(to); return Math.max(0, (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth()) + 1); };

// The annual modes: this leave year's holiday after starting or leaving part-way through, and how much is available today.
// Starting part-way: your share of the year, by months (as the law and most employers do it), rounded up to the quarter hour.
// Leaving part-way: your share by days worked in the year.
// Available: all of it from the start, except in a first year (1/12 a month) or when the employer builds it up monthly.
export function annualEntitlement(hol, year, todayStr, mode = hol.mode) {
    const base = annualHours(hol, mode);
    const joined = startIn(hol, year), leaving = leaveIn(hol, year);
    const from = joined || year.startKey, to = leaving || year.endKey;
    let hours = base.hours, how = "full";
    if (leaving) { hours = q(base.hours * Math.max(0, daysBetween(from, to)) / daysBetween(year.startKey, year.endKey)); how = "leaving"; }
    else if (joined) { const m = monthsStarted(joined, year.endKey); hours = Math.ceil(base.hours * m / 12 * 4) / 4; how = "joined"; }
    const monthly = !!joined || hol.accrue === "monthly";
    let soFar = hours;
    if (monthly && todayStr < to) {
        const total = monthsStarted(from, to), done = todayStr < from ? 0 : monthsStarted(from, todayStr);
        soFar = q(hours * Math.min(done, total) / total);
    }
    if (todayStr < from) soFar = 0;
    return { ...base, yearHours: hours, soFarHours: soFar, how, monthly, joined, leaving, firstYear: !!joined };
}

// ---- requests (bookings) ----
// Each one: { kind: "leave" | "adjust", from, to, hours, note, status: "pending" | "approved" | "rejected" | "cancelled", shifts }
// Old bookings with no status were saved as booked, so they count as approved.
export const statusOf = h => h.status || "approved";
export const kindOf = h => h.kind || "leave";
const list = xs => xs instanceof Map ? [...xs.entries()].map(([id, h]) => ({ id, ...h })) : (xs || []).map((h, i) => ({ id: h.id || String(i), ...h }));

// Holiday taken (approved, ended before today) and booked (approved, today or later), plus pending, in the leave year.
export function usedHours(holidays, year, todayStr) {
    let taken = 0, booked = 0, pending = 0;
    for (const h of list(holidays)) {
        if (!h || !h.from || kindOf(h) !== "leave" || h.from > year.endKey || (h.to || h.from) < year.startKey) continue;
        const n = Number(h.hours) || 0, st = statusOf(h);
        if (st === "pending") pending += n;
        else if (st === "approved") { if ((h.to || h.from) < todayStr) taken += n; else booked += n; }
    }
    return { taken, booked, pending };
}

// ---- the rota: which shifts a holiday covers ----
// Hours a holiday uses = the paid hours of each shift you'd have worked, not 7 days for a week off.
// Days with a shift logged use that shift. Other days use your normal week, if you've set one.
// With neither, it guesses 5 working days in 7 at your holiday-day length, which you can change.
export function rotaHours(shifts, from, to, cfg, hol = {}) {
    const days = [], pat = Array.isArray(hol.pattern) && patternWeek(hol).days ? hol.pattern.map(n => Math.max(0, Number(n) || 0)) : null;
    const perDay = Number(hol.hoursPerDay) || 8;
    let logged = 0;
    for (let d = parse(from); ymd(d) <= to; d = addDays(d, 1)) {
        const k = ymd(d), s = shifts && shifts.get(k);
        if (s) { const h = hoursCounted(s, cfg, hol); if (h > 0) { days.push({ date: k, hours: r2(h), source: "shift", shift: s }); logged++; } continue; }
        if (pat && pat[d.getDay()] > 0) days.push({ date: k, hours: pat[d.getDay()], source: "pattern" });
    }
    if (!pat && !logged) {
        const n = daysBetween(from, to), work = Math.min(n, Math.ceil(n * 5 / 7));
        return { days: [], total: q(work * perDay), source: "estimate", estimateDays: work, perDay };
    }
    return { days, total: q(days.reduce((t, x) => t + x.hours, 0)), source: pat ? (logged ? "mixed" : "pattern") : "shifts" };
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

// ---- holiday pay ----
// The law: holiday pay is your average pay over the last 52 paid weeks, including regular overtime, allowances
// and regular extras (sleep-in pay here), for 4 of the 5.6 weeks. Employers may pay the other 1.6 weeks at basic pay.
// So the estimate is a range: "low" if the employer does that, "likely" at your average.
export function payEstimate(hours, pay, basicRate) {
    const basic = Number(basicRate) || 0, avg = Math.max(Number(pay && pay.perHour) || 0, basic);
    const likely = r2(hours * avg), low = r2(hours * (4 / STATUTORY_WEEKS * avg + 1.6 / STATUTORY_WEEKS * basic));
    return { hours, perHour: avg, basic, likely, low: Math.min(low, likely), extras: avg > basic + 0.005 };
}

// ---- the history: every change to the balance ----
// Built fresh from the shifts, bookings, adjustments and settings each time, so the balance can never change
// without a line here saying why. Credits come first on the same day. Future approved holiday is deducted
// straight away (it's spoken for); pending requests are listed but don't change the balance until approved.
export function ledger({ shifts, holidays, cfg, hol = {}, todayStr, periodFor }) {
    const year = leaveYear(parse(todayStr), hol.startMonth || 1, hol.startDay || 1);
    const mode = hol.mode || "irregular", rows = [];
    const add = (date, type, change, reason, extra = {}) => rows.push({ date, type, change: r2(change), reason, ...extra });
    const carried = Math.max(0, Number(hol.carriedHours) || 0);
    if (carried) add(year.startKey, "Carried over", carried, "Unused holiday from last leave year");
    let earned = 0, ent = null, ir = null;
    if (isAnnual(mode)) {
        ent = annualEntitlement(hol, year, todayStr, mode);
        const from = ent.joined || year.startKey, to = ent.leaving || year.endKey;
        if (!ent.monthly) add(from, "Holiday for the year", ent.yearHours, ent.how === "leaving" ? `Your share up to leaving on ${to}` : "Your whole year's holiday, available from the start");
        else {
            const total = monthsStarted(from, to); let given = 0;
            for (let i = 0; i < total; i++) {
                const s = parse(from), d = i === 0 ? s : new Date(s.getFullYear(), s.getMonth() + i, 1), k = ymd(d);
                if (k > todayStr) break;
                const target = q(ent.yearHours * (i + 1) / total), part = r2(target - given); given = target;
                add(k, "Built up this month", part, `1/${total} of ${r2(ent.yearHours)} hrs${ent.firstYear ? " (first year: it builds up monthly)" : ""}`);
            }
        }
        earned = ent.soFarHours;
    } else {
        ir = irregularEarned(shifts, cfg, hol, year, todayStr, periodFor);
        for (const r of ir.rows) {
            const k = ymd(r.end) > todayStr ? todayStr : ymd(r.end);
            add(k, "Built up from shifts", r.holiday, `${r2(r.hours)} hrs worked ${ymd(r.start)} to ${ymd(r.end)} x ${(ir.rate * 100).toFixed(2)}%, rounded`, { period: true });
        }
        earned = ir.earned;
    }
    if (hol.bankHols === "deduct" && isAnnual(mode)) {
        const pat = Array.isArray(hol.pattern) && patternWeek(hol).days ? hol.pattern : null;
        for (const k of bankHolidaysIn(year, hol.nation)) {
            const h = pat ? Number(pat[parse(k).getDay()]) || 0 : Number(hol.hoursPerDay) || 0;
            if (h > 0) add(k, "Bank holiday", -h, k < todayStr ? "Taken from your holiday" : "Will come out of your holiday", { bank: true, future: k >= todayStr });
        }
    }
    for (const h of list(holidays)) {
        if (!h || !h.from) continue;
        const end = h.to || h.from, n = Number(h.hours) || 0, st = statusOf(h);
        if (kindOf(h) === "adjust") { if (h.from >= year.startKey && h.from <= year.endKey && st !== "cancelled") add(h.from, "Adjustment", n, h.note || "Change from your employer", { ref: h.id }); continue; }
        if (h.from > year.endKey || end < year.startKey) continue;
        const what = h.from === end ? h.from : `${h.from} to ${end}`;
        if (st === "approved") add(h.from, end < todayStr ? "Holiday taken" : "Holiday booked", -n, `${what}${h.note ? " · " + h.note : ""}`, { ref: h.id, future: end >= todayStr });
        else add(h.from, st === "pending" ? "Request pending" : st === "rejected" ? "Request turned down" : "Request cancelled", 0, `${n} hrs, ${what} (no change until approved)`, { ref: h.id, info: true });
    }
    for (const c of hol.changes || []) { const k = String(c.at || "").slice(0, 10); if (k >= year.startKey && k <= year.endKey) add(k, "Settings changed", 0, c.text || "Holiday settings changed", { info: true }); }
    rows.sort((a, b) => a.date.localeCompare(b.date) || (b.change > 0) - (a.change > 0) || (a.info ? 1 : 0) - (b.info ? 1 : 0));
    let bal = 0;
    for (const r of rows) { bal = r2(bal + r.change); r.balance = bal; }
    return { year, mode, rows, balance: bal, carried, earned, ent, ir };
}

// Everything the Holiday screen shows, in hours.
export function holidaySummary({ shifts, holidays, cfg, hol = {}, todayStr, periodFor }) {
    const L = ledger({ shifts, holidays, cfg, hol, todayStr, periodFor });
    const { year, mode, carried } = L;
    const used = usedHours(holidays || [], year, todayStr);
    const bank = L.rows.filter(r => r.bank).reduce((t, r) => t - r.change, 0);
    const bankTaken = L.rows.filter(r => r.bank && !r.future).reduce((t, r) => t - r.change, 0);
    const adjustments = L.rows.filter(r => r.type === "Adjustment").reduce((t, r) => t + r.change, 0);
    const pay = holidayPayRate(shifts, cfg, hol, todayStr);
    const out = { mode, year, carried, ...used, bank, bankTaken, bankBooked: r2(bank - bankTaken), adjustments, pay, rate: accrualRate(hol.weeks), ledger: L.rows };
    if (isAnnual(mode)) {
        const e = L.ent;
        Object.assign(out, { entitlement: e, earned: e.soFarHours, yearTotal: e.yearHours, statutory: e.statutory, contractual: e.contractual });
        if (mode === "regular") Object.assign(out.entitlement, regularEntitlement(hol, year, todayStr), { hours: e.yearHours, soFarHours: e.soFarHours });
    } else {
        const ir = L.ir;
        // by the end of the leave year, if the next weeks look like the last 12
        const back = addDays(parse(todayStr), -84);
        let recent = 0;
        for (const [k, s] of shifts) if (k > ymd(back) && k <= todayStr && k >= year.startKey) recent += hoursCounted(s, cfg, hol);
        const weeksRecent = Math.min(12, Math.max(1, (parse(todayStr) - Math.max(back, year.start)) / 6048e5));
        const endD = hol.leaving && hol.leaving < year.endKey && hol.leaving >= todayStr ? parse(hol.leaving) : year.end;
        const weeksLeft = Math.max(0, (endD - parse(todayStr)) / 6048e5);
        const projected = ir.earned + Math.round(recent / weeksRecent * weeksLeft * ir.rate);
        const statWeeks = Math.min(Number(hol.weeks) || STATUTORY_WEEKS, STATUTORY_WEEKS);
        Object.assign(out, { irregular: ir, earned: ir.earned, yearTotal: projected, statutory: null, contractual: null,
            statutoryShare: (Number(hol.weeks) || STATUTORY_WEEKS) > STATUTORY_WEEKS ? statWeeks / Number(hol.weeks) : 1 });
        if (mode === "rolledup") {
            let gross = 0;
            for (const [k, s] of shifts) if (k >= year.startKey && k <= todayStr) gross += calc(s, cfg, todayStr).total;
            out.rolled = { grossYear: gross, yearPay: rolledUp(gross, hol.weeks) };
        }
    }
    out.left = L.balance;
    out.leftIfPending = r2(L.balance - used.pending);
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
