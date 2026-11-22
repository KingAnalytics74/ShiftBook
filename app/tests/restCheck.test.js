import test from "node:test";
import assert from "node:assert/strict";
import { restDay, worked, hasDayHrs, overlapOf } from "../src/core/restCheck.js";
import { ymd, parse, addDays } from "../src/core/dates.js";

const run = (start, n, extra = {}) => {
    const m = new Map();
    for (let i = 0; i < n; i++) { const k = ymd(addDays(parse(start), i)); m.set(k, { date: k, dayHours: 8, breakHrs: 0, ...extra }); }
    return m;
};

test("worked and hasDayHrs", () => {
    assert.equal(worked(undefined), false);
    assert.equal(worked({ sleepIn: true }), true);
    assert.equal(hasDayHrs({ dayHours: 0 }), false);
});
test("a day off is 'off'", () => {
    assert.equal(restDay("2026-10-01", new Map()).level, "off");
});
test("6 days in a row is amber, 7 is red", () => {
    assert.equal(restDay("2026-10-06", run("2026-10-01", 6)).level, "amber");
    assert.equal(restDay("2026-10-07", run("2026-10-01", 7)).level, "red");
});
test("over 48 hours in 7 days is red", () => {
    assert.equal(restDay("2026-10-05", run("2026-10-01", 5, { dayHours: 8 })).level, "ok");
    assert.equal(restDay("2026-10-05", run("2026-10-01", 5, { dayHours: 9 })).level, "amber");
    assert.equal(restDay("2026-10-05", run("2026-10-01", 5, { dayHours: 10 })).level, "red");
});
test("sleep-in then day shift is amber", () => {
    const m = new Map([["2026-10-01", { date: "2026-10-01", sleepIn: true }], ["2026-10-02", { date: "2026-10-02", dayHours: 8 }]]);
    assert.equal(restDay("2026-10-02", m).level, "amber");
});
test("restNow: three clear days put someone back on green, older red days no longer count", async () => {
  const { restNow } = await import("../src/core/restCheck.js");
  const m = new Map();
  for (let d = 1; d <= 9; d++) m.set("2026-11-0" + d, { sleepIn: true });   // nine days in a row: red from the 7th
  assert.equal(restNow("2026-11-09", m).level, "red");
  assert.equal(restNow("2026-11-10", m).level, "red");   // day off, but the 8th/9th still count
  assert.equal(restNow("2026-11-12", m).level, "ok");    // three days since: back on green
});

test("shifts that run into each other are caught", () => {
    const sleep = { date: "2026-11-21", start: "20:00", end: "08:00", sleepIn: true };
    const day = { date: "2026-11-22", start: "07:30", end: "19:30", dayHours: 12 };
    const m = new Map([[sleep.date, sleep], [day.date, day]]);
    assert.deepEqual(overlapOf(day, m), { key: "2026-11-21", mins: 30 });
    assert.deepEqual(overlapOf(sleep, m), { key: "2026-11-22", mins: 30 });
    const later = { ...day, start: "08:00" };
    assert.equal(overlapOf(later, new Map([[sleep.date, sleep], [later.date, later]])), null);
    assert.equal(overlapOf({ date: "2026-11-22", dayHours: 8 }, m), null);
});
