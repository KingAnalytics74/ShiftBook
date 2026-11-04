import test from "node:test";
import assert from "node:assert/strict";
import { calc } from "../src/core/pay.js";
import { periodFor } from "../src/core/periods.js";
import { restDay, spanOf, isNight } from "../src/core/restCheck.js";
import { shiftKind, forecast } from "../src/core/forecast.js";
import { ymd, parse, addDays } from "../src/core/dates.js";

const cfg = { hourlyRate: 13, sleepInRate: 40 };

test("a shift's own rate is used instead of the usual rate", () => {
    assert.equal(calc({ date: "2026-11-02", dayHours: 10, breakHrs: 0, rate: 14.5 }, cfg, "2026-11-01").total, 145);
    assert.equal(calc({ date: "2026-11-02", dayHours: 10, breakHrs: 0, rate: null }, cfg, "2026-11-01").total, 130);
});

test("pay month can start on any day up to 31", () => {
    const p = periodFor(new Date(2026, 10, 10), 0, 31);       // 10 Nov, start day 31
    assert.equal(ymd(p.start), "2026-10-31");
    assert.equal(ymd(p.end), "2026-11-29");                   // November has 30 days, so the next period starts on the 30th
    const feb = periodFor(new Date(2027, 1, 28), 0, 31);       // 28 Feb 2027 is February's last day
    assert.equal(ymd(feb.start), "2027-02-28");
    assert.equal(ymd(feb.end), "2027-03-30");
});

test("night shifts finish the next day", () => {
    const sp = spanOf({ date: "2026-11-02", start: "22:00", end: "06:00" });
    assert.equal((sp.en - sp.st) / 36e5, 8);
    assert.equal(isNight({ start: "22:00", end: "06:00" }), true);
    assert.equal(isNight({ start: "07:00", end: "15:00" }), false);
    assert.equal(isNight({ start: "20:00", end: "08:00", sleepIn: true }), false);
});

test("under 11 hours between shifts is flagged", () => {
    const m = new Map([
        ["2026-11-02", { date: "2026-11-02", start: "14:00", end: "22:00", dayHours: 8, breakHrs: 0.5 }],
        ["2026-11-03", { date: "2026-11-03", start: "07:00", end: "15:00", dayHours: 8, breakHrs: 0.5 }]
    ]);
    const r = restDay("2026-11-03", m);
    assert.equal(r.level, "amber");
    assert.match(r.reasons[0], /9 hours off between shifts/);
    m.set("2026-11-03", { date: "2026-11-03", start: "10:00", end: "18:00", dayHours: 8, breakHrs: 0.5 });
    assert.equal(restDay("2026-11-03", m).level, "ok");
});

test("forecast keeps the shift type and times", () => {
    assert.equal(shiftKind({ type: "Waking night" }), "Waking night");
    assert.equal(shiftKind({ start: "22:00", end: "06:00", dayHours: 8 }), "Night");
    const shifts = new Map();
    for (let w = 1; w <= 3; w++) {
        const k = ymd(addDays(parse("2026-11-02"), -7 * w));
        shifts.set(k, { date: k, type: "Waking night", start: "21:00", end: "07:00", dayHours: 10, breakHrs: 0, sleepIn: false, users: [] });
    }
    const f = forecast(shifts, "2026-11-02", s => calc(s, cfg, "2026-11-02"));
    const mon = f.days[0].guess;
    assert.equal(mon.type, "Waking night");
    assert.equal(mon.start, "21:00");
    assert.equal(mon.sleepIn, false);
});
