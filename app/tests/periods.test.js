import { test } from "node:test";
import assert from "node:assert/strict";
import { periodFor, daysIn } from "../src/core/periods.js";

test("period starting on the 26th: 31 Oct falls in 26 Oct to 25 Nov", () => {
    const p = periodFor(new Date(2026, 9, 31), 0, 26);
    assert.equal(p.start.getDate(), 26);
    assert.equal(p.start.getMonth(), 9);
    assert.equal(p.end.getDate(), 25);
    assert.equal(p.end.getMonth(), 10);
});

test("before the start day, the period began last month", () => {
    const p = periodFor(new Date(2026, 9, 10), 0, 26);
    assert.equal(p.start.getMonth(), 8);
});

test("daysIn counts every day inclusive", () => {
    const p = periodFor(new Date(2026, 9, 31), 0, 26);
    assert.equal(daysIn(p).length, 31);
});