import test from "node:test";
import assert from "node:assert/strict";
import { restDay, worked, hasDayHrs } from "../src/core/restCheck.js";
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