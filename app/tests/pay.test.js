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
});