import { test } from "node:test";
import assert from "node:assert/strict";
import { restDay } from "../src/core/restCheck.js";

const mk = days => new Map(days.map(d => [d, { date: d, dayHours: 8, breakHrs: 0, sleepIn: false }]));

test("a day with no shift is a day off", () => {
    assert.equal(restDay("2026-10-10", new Map()).level, "off");
});

test("7 days in a row is red", () => {
    const m = mk(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"]);
    assert.equal(restDay("2026-10-07", m).level, "red");
});

test("6 days in a row is amber", () => {
    const m = mk(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]);
    assert.equal(restDay("2026-10-06", m).level, "amber");
});