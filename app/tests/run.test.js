import test from "node:test";
import assert from "node:assert/strict";
import { buildRun, runPay, addDays, RUN_MAX } from "../src/core/run.js";

const DAY = { name: "Day", paid: "hours", start: "08:00", end: "20:00", breakHrs: 2 };
const SLEEP = { name: "Sleep-in", paid: "sleep", start: "20:00", end: "08:00", breakHrs: 0 };
const EARLY = { name: "Early", paid: "hours", start: "06:00", end: "14:00", breakHrs: 0.5 };
const LATE = { name: "Late", paid: "hours", start: "14:00", end: "22:00", breakHrs: 0.5 };
const NIGHT = { name: "Night", paid: "hours", start: "22:00", end: "06:00", breakHrs: 0 };

test("one shift is one record", () => {
  assert.deepEqual(buildRun("2026-11-24", [DAY]).records, [
    { date: "2026-11-24", type: "Day", start: "08:00", end: "20:00", sleepIn: false, dayHours: 12, breakHrs: 2 }
  ]);
});

test("Day, Sleep-in, Day: a care 36-hour run over two dates", () => {
  const { records } = buildRun("2026-11-24", [DAY, SLEEP, DAY]);
  assert.deepEqual(records, [
    { date: "2026-11-24", type: "Day + Sleep-in", start: "08:00", end: "08:00", sleepIn: true, dayHours: 12, breakHrs: 2 },
    { date: "2026-11-25", type: "Day", start: "08:00", end: "20:00", sleepIn: false, dayHours: 12, breakHrs: 2 }
  ]);
});

test("four picks: Day, Sleep-in, Day, Sleep-in", () => {
  const { records } = buildRun("2026-11-24", [DAY, SLEEP, DAY, SLEEP]);
  assert.deepEqual(records.map(r => [r.date, r.type]), [["2026-11-24", "Day + Sleep-in"], ["2026-11-25", "Day + Sleep-in"]]);
  assert.equal(RUN_MAX, 4);
});

test("Sleep-in then Day: the day lands on the next date", () => {
  const { records } = buildRun("2026-11-24", [SLEEP, DAY]);
  assert.deepEqual(records.map(r => [r.date, r.type, r.sleepIn, r.dayHours]), [["2026-11-24", "Sleep-in", true, null], ["2026-11-25", "Day", false, 12]]);
});

test("Day then Day: two dates", () => {
  assert.deepEqual(buildRun("2026-11-30", [DAY, DAY]).records.map(r => r.date), ["2026-11-30", "2026-12-01"]);
});

test("Early then Late on one date become one longer day", () => {
  const { records } = buildRun("2026-11-24", [EARLY, LATE]);
  assert.deepEqual(records, [{ date: "2026-11-24", type: "Early + Late", start: "06:00", end: "22:00", sleepIn: false, dayHours: 16, breakHrs: 1 }]);
});

test("nights past midnight chain onto the following nights", () => {
  const { records } = buildRun("2026-11-24", [NIGHT, NIGHT, NIGHT]);
  assert.deepEqual(records.map(r => r.date), ["2026-11-24", "2026-11-25", "2026-11-26"]);
});

test("a pick without times is refused", () => {
  assert.ok(buildRun("2026-11-24", [{ name: "X", paid: "hours", start: "", end: "" }]).error);
});

test("pay adds each pick: hours less breaks at the rate, plus sleep-ins", () => {
  // Day: (12 - 2) x £13 = £130; Sleep-in: £40; Day: £130
  assert.equal(runPay([DAY, SLEEP, DAY], 13, 40), 300);
  assert.equal(runPay([DAY], 13, 40), 130);
  assert.equal(runPay([{ ...DAY, rate: 15 }], 13, 40), 150);
});

test("addDays crosses months and years", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-28", 2), "2026-03-30");
});
