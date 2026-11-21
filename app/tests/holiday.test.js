import test from "node:test";
import assert from "node:assert/strict";
import { accrualRate, leaveYear, hoursCounted, irregularEarned, regularDaysPerYear, regularEntitlement, usedHours,
    holidayPayRate, rolledUp, holidaySummary, bankHolidaysIn, statutoryHours, annualHours, annualEntitlement,
    rotaHours, payEstimate, ledger } from "../src/core/holiday.js";
import { periodFor } from "../src/core/periods.js";
import { ymd } from "../src/core/dates.js";

const cfg = { hourlyRate: 13, sleepInRate: 40, periodStartDay: 26 };
const pf = d => periodFor(d, 0, 26);

test("12.07% for 5.6 weeks, more for a bigger contract", () => {
    assert.equal(accrualRate(), 0.1207);
    assert.equal(accrualRate(6), 0.1304);
    assert.equal(accrualRate(2), 0.1207); // never below the legal minimum
});

test("leave year from January or April", () => {
    const y = leaveYear(new Date(2026, 10, 20), 1);
    assert.equal(y.startKey, "2026-01-01"); assert.equal(y.endKey, "2026-12-31");
    const a = leaveYear(new Date(2027, 1, 10), 4);
    assert.equal(a.startKey, "2026-04-01"); assert.equal(a.endKey, "2027-03-31");
});

test("leave year can start on any day", () => {
    const tax = leaveYear(new Date(2026, 10, 20), 4, 6); // 6 April, like the tax year
    assert.equal(tax.startKey, "2026-04-06"); assert.equal(tax.endKey, "2027-04-05");
    const before = leaveYear(new Date(2026, 3, 5), 4, 6); // 5 April is still last year's
    assert.equal(before.startKey, "2025-04-06"); assert.equal(before.endKey, "2026-04-05");
    const started = leaveYear(new Date(2026, 10, 20), 9, 15); // the day they started: 15 September
    assert.equal(started.startKey, "2026-09-15"); assert.equal(started.endKey, "2027-09-14");
    const late = leaveYear(new Date(2026, 1, 28), 2, 31); // 31 February means the last day of February
    assert.equal(late.startKey, "2026-02-28"); assert.equal(late.endKey, "2027-02-27");
});

test("summary uses the chosen start day", () => {
    const s = holidaySummary({ shifts: new Map(), holidays: [], cfg, hol: { startMonth: 4, startDay: 6 }, todayStr: "2026-11-20", periodFor: pf });
    assert.equal(s.year.startKey, "2026-04-06");
});

test("hours counted: breaks off, sleep-ins only when payroll turns them into hours", () => {
    const day = { date: "2026-11-02", dayHours: 12, breakHrs: 2 };
    const sleep = { date: "2026-11-03", dayHours: null, sleepIn: true };
    assert.equal(hoursCounted(day, cfg), 10);
    assert.equal(hoursCounted(sleep, cfg), 0);
    assert.equal(Math.round(hoursCounted(sleep, cfg, { sleepIns: "payroll" }) * 100) / 100, 3.08); // £40 / £13
});

test("irregular hours: 12.07% per pay period, rounded to the nearest hour", () => {
    const shifts = new Map();
    // 20 ten-hour shifts between 26 Oct and 15 Nov = 200 hours in one pay period
    for (let d = 26, n = 0; n < 20; d++, n++) { const k = ymd(new Date(2026, 9, d)); shifts.set(k, { date: k, dayHours: 12, breakHrs: 2 }); }
    const y = leaveYear(new Date(2026, 10, 20), 1);
    const r = irregularEarned(shifts, cfg, {}, y, "2026-11-20", pf);
    assert.equal(r.hoursWorked, 200);
    assert.equal(r.earned, 24); // 200 x 0.1207 = 24.14 -> 24
    // future shifts don't count yet
    shifts.set("2026-11-24", { date: "2026-11-24", dayHours: 12, breakHrs: 2 });
    assert.equal(irregularEarned(shifts, cfg, {}, y, "2026-11-20", pf).hoursWorked, 200);
});

test("the October payslip: 208.65 paid hours gives 25 hours of holiday", () => {
    assert.equal(Math.round(208.65 * accrualRate()), 25);
});

test("regular hours: 5.6 x days a week, capped at 28 days", () => {
    assert.equal(regularDaysPerYear({ daysPerWeek: 3 }), 16.8);
    assert.equal(regularDaysPerYear({ daysPerWeek: 5 }), 28);
    assert.equal(regularDaysPerYear({ daysPerWeek: 6 }), 28);
    assert.equal(regularDaysPerYear({ daysPerWeek: 5, contractDays: 35 }), 35); // e.g. NHS 27 days + 8 bank holidays
});

test("regular hours: starting part-way through the year", () => {
    const y = leaveYear(new Date(2026, 3, 1), 1);
    const e = regularEntitlement({ daysPerWeek: 5, hoursPerDay: 7.5, joined: "2026-04-01" }, y, "2026-06-30");
    assert.equal(e.days, 21);       // 28 x 9/12
    assert.equal(e.soFarDays, 7);   // 3 months x 28/12
    assert.equal(e.hours, 157.5);
});

test("regular hours: a full year isn't rounded", () => {
    const y = leaveYear(new Date(2026, 10, 20), 1);
    assert.equal(regularEntitlement({ daysPerWeek: 4, hoursPerDay: 10 }, y, "2026-11-20").days, 22.4);
});

test("taken and booked holiday", () => {
    const y = leaveYear(new Date(2026, 10, 20), 1);
    const u = usedHours([{ from: "2026-08-03", to: "2026-08-07", hours: 50 }, { from: "2026-12-21", to: "2026-12-24", hours: 40 }, { from: "2025-12-29", to: "2025-12-31", hours: 30 }], y, "2026-11-20");
    assert.deepEqual(u, { taken: 50, booked: 40, pending: 0 });
});

test("holiday pay rate: average of weeks with pay", () => {
    const shifts = new Map([
        ["2026-11-09", { date: "2026-11-09", dayHours: 12, breakHrs: 2 }],
        ["2026-11-10", { date: "2026-11-10", dayHours: null, sleepIn: true }],
        ["2026-10-26", { date: "2026-10-26", dayHours: 12, breakHrs: 2 }]
    ]);
    const r = holidayPayRate(shifts, cfg, {}, "2026-11-20");
    assert.equal(r.weeks, 2);
    assert.equal(r.weekly, (130 + 40 + 130) / 2);
    assert.equal(Math.round(r.perHour * 100) / 100, 13); // sleep-in counted as hours at the same rate
});

test("rolled-up pay is 12.07% of gross", () => {
    assert.equal(rolledUp(2712.45), 327.39);
});

test("summary: left = carried + earned - taken - booked", () => {
    const shifts = new Map([["2026-11-02", { date: "2026-11-02", dayHours: 12, breakHrs: 2 }]]);
    const s = holidaySummary({ shifts, holidays: [{ from: "2026-11-16", to: "2026-11-30", hours: 3 }], cfg, hol: { carriedHours: 8 }, todayStr: "2026-11-20", periodFor: pf });
    assert.equal(s.earned, 1); // 10 x 0.1207 = 1.2 -> 1
    assert.equal(s.booked, 3);
    assert.equal(s.left, 8 + 1 - 0 - 3);
});

test("bank holidays in the leave year", () => {
    const y = leaveYear(new Date(2026, 10, 20), 1);
    assert.equal(bankHolidaysIn(y, "ew").length, 8);
    assert.equal(bankHolidaysIn(y, "sc").length, 9);
    assert.equal(bankHolidaysIn(y, "ni").length, 10);
});

// ---------- every kind of contract ----------
const Y26 = leaveYear(new Date(2026, 10, 20), 1);

test("same hours every week: 5.6 x weekly hours, capped at 28 days for 6-day weeks", () => {
    assert.equal(statutoryHours({ weeklyHours: 37.5, daysPerWeek: 5 }), 210);           // 5.6 x 37.5 = the brief's 210 hours
    assert.equal(statutoryHours({ weeklyHours: 20, daysPerWeek: 3 }), 112);
    assert.equal(statutoryHours({ weeklyHours: 48, daysPerWeek: 6 }), 224);             // 28 days of 8 hours, not 33.6
    assert.equal(annualHours({ mode: "weekly", weeklyHours: 36, daysPerWeek: 3, weeks: 6 }).hours, 216); // contract: 6 weeks
});

test("a set amount from the employer, and never below the legal minimum", () => {
    const a = annualHours({ mode: "fixed", annualHours: 250, weeklyHours: 37.5, daysPerWeek: 5 });
    assert.deepEqual([a.hours, a.statutory, a.contractual], [250, 210, 40]);
    const low = annualHours({ mode: "fixed", annualDays: 20, hoursPerDay: 7.5, weeklyHours: 37.5, daysPerWeek: 5 });
    assert.equal(low.belowMinimum, true); assert.equal(low.hours, 210);
});

test("leaving part-way: your share by days", () => {
    const e = annualEntitlement({ mode: "weekly", weeklyHours: 37.5, daysPerWeek: 5, leaving: "2026-06-30" }, Y26, "2026-11-20");
    assert.equal(e.yearHours, 104.25); // 210 x 181/365 = 104.14 -> nearest quarter
});

test("employer builds it up monthly", () => {
    const e = annualEntitlement({ mode: "fixed", annualHours: 240, accrue: "monthly" }, Y26, "2026-11-20");
    assert.equal(e.yearHours, 240); assert.equal(e.soFarHours, 220); // 11 months started x 20
});

// ---------- the rota ----------
test("a week off takes the shifts you'd have worked: 4 x 12 hours = 48, not 7 days", () => {
    const sh = new Map();
    for (const k of ["2026-12-07", "2026-12-08", "2026-12-10", "2026-12-12"]) sh.set(k, { date: k, dayHours: 12, breakHrs: 0 });
    const r = rotaHours(sh, "2026-12-07", "2026-12-13", cfg, { hoursPerDay: 12 });
    assert.equal(r.total, 48); assert.equal(r.days.length, 4); assert.equal(r.source, "shifts");
});

test("days with no shift logged use your normal week", () => {
    const pattern = [0, 12, 12, 0, 12, 0, 12]; // Sun..Sat
    const r = rotaHours(new Map(), "2026-12-07", "2026-12-13", cfg, { pattern });
    assert.equal(r.total, 48); assert.equal(r.source, "pattern");
});

test("unpaid breaks don't come out of holiday", () => {
    const sh = new Map([["2026-12-07", { date: "2026-12-07", dayHours: 12, breakHrs: 2 }]]);
    assert.equal(rotaHours(sh, "2026-12-07", "2026-12-07", cfg, {}).total, 10);
});

// ---------- holiday pay ----------
test("holiday pay estimate: a range when regular extras lift the average above basic", () => {
    const e = payEstimate(10, { perHour: 15 }, 13);
    assert.equal(e.likely, 150);
    assert.equal(e.low, 144.29); // 4/5.6 of the time at £15, 1.6/5.6 at £13
    assert.equal(payEstimate(10, { perHour: 12 }, 13).likely, 130); // never below basic
});

// ---------- requests and the history ----------
test("pending requests don't change the balance; turned-down ones are kept but ignored", () => {
    const hs = [{ id: "a", from: "2026-12-21", to: "2026-12-22", hours: 20, status: "pending" },
        { id: "b", from: "2026-12-28", to: "2026-12-28", hours: 10, status: "rejected" },
        { id: "c", from: "2026-08-03", to: "2026-08-03", hours: 10 }]; // old booking with no status = approved
    const s = holidaySummary({ shifts: new Map(), holidays: hs, cfg, hol: { mode: "fixed", annualHours: 100 }, todayStr: "2026-11-20", periodFor: pf });
    assert.deepEqual([s.taken, s.booked, s.pending], [10, 0, 20]);
    assert.equal(s.left, 90); assert.equal(s.leftIfPending, 70);
});

test("the history adds up to the balance, line by line", () => {
    const shifts = new Map([["2026-11-02", { date: "2026-11-02", dayHours: 12, breakHrs: 2 }], ["2026-10-05", { date: "2026-10-05", dayHours: 50, breakHrs: 0 }]]);
    const holidays = [{ id: "h", from: "2026-12-21", to: "2026-12-24", hours: 4 }, { id: "x", kind: "adjust", from: "2026-06-01", hours: 5, note: "Payroll correction" }];
    const hol = { carriedHours: 8, changes: [{ at: "2026-11-01T10:00:00Z", text: "Sleep-ins now count" }] };
    const L = ledger({ shifts, holidays, cfg, hol, todayStr: "2026-11-20", periodFor: pf });
    const s = holidaySummary({ shifts, holidays, cfg, hol, todayStr: "2026-11-20", periodFor: pf });
    assert.equal(L.balance, s.left);
    assert.equal(L.rows.reduce((t, r) => t + r.change, 0), s.left);
    assert.deepEqual(L.rows.map(r => r.type), ["Carried over", "Adjustment", "Built up from shifts", "Settings changed", "Built up from shifts", "Holiday booked"]);
    assert.equal(s.adjustments, 5);
});

test("bank holidays can come out of the holiday", () => {
    const s = holidaySummary({ shifts: new Map(), holidays: [], cfg, hol: { mode: "weekly", weeklyHours: 37.5, daysPerWeek: 5, hoursPerDay: 7.5, bankHols: "deduct" }, todayStr: "2026-11-20", periodFor: pf });
    assert.equal(s.bank, 60); // 8 bank holidays x 7.5
    assert.equal(s.left, 150);
});
