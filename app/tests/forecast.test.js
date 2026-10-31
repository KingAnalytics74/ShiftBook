import test from "node:test";
import assert from "node:assert/strict";
import { forecast, shiftKind } from "../src/core/forecast.js";
import { ymd, parse, addDays } from "../src/core/dates.js";

const calcFn = s => ({ total: (Number(s.dayHours) || 0) * 10 });

test("shiftKind labels", () => {
    assert.equal(shiftKind({ dayHours: 8 }), "Day shift");
    assert.equal(shiftKind({ sleepIn: true }), "Sleep-in");
    assert.equal(shiftKind({ sleepIn: true, dayHours: 8 }), "Day + sleep-in");
});
test("no history gives an empty forecast", () => {
    assert.deepEqual(forecast(new Map(), "2026-10-31", calcFn), { days: [], basis: 0, weeks: 0 });
});
test("a weekly pattern is predicted for the same weekday", () => {
    const today = "2026-10-31";
    const m = new Map();
    for (let i = 1; i <= 56; i++) {
        const d = addDays(parse(today), -i);
        if (d.getDay() === 1) { const k = ymd(d); m.set(k, { date: k, dayHours: 12, breakHrs: 2, users: ["A"] }); }
    }
    const f = forecast(m, today, calcFn);
    assert.equal(f.days.length, 7);
    const mon = f.days.find(x => x.d.getDay() === 1);
    assert.equal(mon.guess.dayHours, 12);
    assert.equal(mon.p, 1);
    assert.equal(mon.pay, 120);
    const sun = f.days.find(x => x.d.getDay() === 0);
    assert.equal(sun.guess, null);
});