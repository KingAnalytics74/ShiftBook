import test from "node:test";
import assert from "node:assert/strict";
import { calc, summarise } from "../src/core/pay.js";

const cfg = { hourlyRate: 13, sleepInRate: 40 };
const today = "2026-10-31";

test("12h day with 2h break is 10 paid hours", () => {
    const c = calc({ date: "2026-10-01", dayHours: 12, breakHrs: 2 }, cfg, today);
    assert.equal(c.net, 10);
    assert.equal(c.total, 130);
    assert.equal(c.status, "Worked");
});
test("sleep-in adds the flat rate; future shifts are Rostered", () => {
    const c = calc({ date: "2026-11-05", dayHours: null, sleepIn: true }, cfg, today);
    assert.equal(c.net, 0);
    assert.equal(c.total, 40);
    assert.equal(c.status, "Rostered");
});
test("break larger than hours never goes negative", () => {
    assert.equal(calc({ date: "2026-10-01", dayHours: 1, breakHrs: 3 }, cfg, today).net, 0);
});
test("summarise totals a period", () => {
    const shifts = new Map([
        ["2026-10-27", { date: "2026-10-27", dayHours: 12, breakHrs: 2, users: ["A"] }],
        ["2026-10-28", { date: "2026-10-28", dayHours: null, sleepIn: true, fare: 3, users: ["A"] }],
    ]);
    const p = { start: new Date(2026, 9, 26), end: new Date(2026, 10, 25) };
    const s = summarise(p, shifts, cfg, today);
    assert.equal(s.rows.length, 31);
    assert.equal(s.t.shifts, 2);
    assert.equal(s.t.gross, 170);
    assert.equal(s.t.sleepIns, 1);
    assert.equal(s.t.fares, 3);
    assert.equal(s.users.get("A").shifts, 2);
});test("summarise counts waking nights by shift type", () => {
    const shifts = new Map([
        ["2026-10-27", { date: "2026-10-27", type: "Waking night", dayHours: 12, breakHrs: 0 }],
        ["2026-10-28", { date: "2026-10-28", type: "Sleep-in", dayHours: null, sleepIn: true }],
        ["2026-10-29", { date: "2026-10-29", type: "Waking Nights (Flat 2)", dayHours: 10, breakHrs: 0 }],
        ["2026-10-30", { date: "2026-10-30", type: "Long day", dayHours: 12, breakHrs: 2 }],
    ]);
    const p = { start: new Date(2026, 9, 26), end: new Date(2026, 10, 25) };
    const t = summarise(p, shifts, cfg, today).t;
    assert.equal(t.wakingNights, 2);
    assert.equal(t.sleepIns, 1);
});

test("a sleep-in can have its own pay for that shift", () => {
    assert.equal(calc({ date: "2026-11-01", sleepIn: true, sleepRate: 55 }, cfg, "2026-11-30").total, 55);
    assert.equal(calc({ date: "2026-11-01", sleepIn: true }, cfg, "2026-11-30").total, 40);
    assert.equal(calc({ date: "2026-11-01", sleepIn: true, sleepRate: "" }, cfg, "2026-11-30").total, 40);
    assert.equal(calc({ date: "2026-11-01", sleepIn: false, sleepRate: 55, dayHours: 2 }, cfg, "2026-11-30").total, 26);
});

test("a waking night straight after a shift has its own hours and rate", () => {
    const s = { date: "2026-11-01", dayHours: 12, breakHrs: 1, wakingNight: true, wakeHours: 12, wakeRate: 14 };
    const c = calc(s, cfg, "2026-11-30");
    assert.equal(c.net, 23);
    assert.equal(c.hourly, 11 * 13 + 12 * 14);
    assert.equal(calc({ ...s, wakeRate: null }, cfg, "2026-11-30").hourly, 23 * 13);
    assert.equal(calc({ ...s, rate: 15, wakeRate: null }, cfg, "2026-11-30").hourly, 23 * 15);
    assert.equal(calc({ ...s, wakingNight: false }, cfg, "2026-11-30").hourly, 11 * 13);
    // a sleep-in after a shift: day hours by the hour plus its own sleep-in pay
    assert.equal(calc({ date: "2026-11-01", dayHours: 12, breakHrs: 1, sleepIn: true, sleepRate: 50 }, cfg, "2026-11-30").total, 143 + 50);
});
