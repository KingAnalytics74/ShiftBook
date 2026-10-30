import { test } from "node:test";
import assert from "node:assert/strict";
import { calc } from "../src/core/pay.js";

const cfg = { hourlyRate: 13, sleepInRate: 40 };
const today = "2026-10-31";

test("12h shift with 2h break pays 10 net hours", () => {
    const c = calc({ date: "2026-10-01", dayHours: 12, breakHrs: 2, sleepIn: false }, cfg, today);
    assert.equal(c.net, 10);
    assert.equal(c.total, 130);
    assert.equal(c.status, "Worked");
});

test("sleep-in only pays the flat rate", () => {
    const c = calc({ date: "2026-10-01", dayHours: null, sleepIn: true }, cfg, today);
    assert.equal(c.net, 0);
    assert.equal(c.total, 40);
});

test("future shift is Rostered", () => {
    const c = calc({ date: "2026-11-05", dayHours: 8, sleepIn: false }, cfg, today);
    assert.equal(c.status, "Rostered");
});