import test from "node:test";
import assert from "node:assert/strict";
import { accrualRate, leaveYear, hoursCounted, irregularEarned, regularDaysPerYear, regularEntitlement, usedHours,
    holidayPayRate, rolledUp, holidaySummary, bankHolidaysIn } from "../src/core/holiday.js";
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
    assert.deepEqual(u, { taken: 50, booked: 40 });
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
