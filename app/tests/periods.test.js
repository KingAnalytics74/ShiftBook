import test from "node:test";
import assert from "node:assert/strict";
import { periodFor, daysIn } from "../src/core/periods.js";
import { ymd, parse, addDays } from "../src/core/dates.js";

test("date helpers round-trip", () => {
    assert.equal(ymd(parse("2026-03-05")), "2026-03-05");
    assert.equal(ymd(addDays(parse("2026-12-31"), 1)), "2027-01-01");
});
test("period containing 10 Nov starts on 26 Oct", () => {
    const p = periodFor(new Date(2026, 10, 10), 0, 26);
    assert.equal(ymd(p.start), "2026-10-26");
    assert.equal(ymd(p.end), "2026-11-25");
});
test("on or after the start day the period starts that month", () => {
    assert.equal(ymd(periodFor(new Date(2026, 10, 26), 0, 26).start), "2026-11-26");
});
test("offsets and year rollover", () => {
    assert.equal(ymd(periodFor(new Date(2026, 0, 10), 0, 26).start), "2025-12-26");
    assert.equal(ymd(periodFor(new Date(2026, 10, 10), 1, 26).start), "2026-11-26");
    assert.equal(ymd(periodFor(new Date(2026, 10, 10), -1, 26).start), "2026-09-26");
});
test("default start day is 26 and daysIn covers the period", () => {
    const p = periodFor(new Date(2026, 10, 10));
    assert.equal(ymd(p.start), "2026-10-26");
    assert.equal(daysIn(p).length, 31);
});