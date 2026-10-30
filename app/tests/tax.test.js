import { test } from "node:test";
import assert from "node:assert/strict";
import { deductions } from "../src/core/tax.js";

const paye = { employment: "paye", taxCode: "1257L", pensionPct: 0, studentLoan: "none" };

test("below the free-pay threshold: no tax, no NI", () => {
    const d = deductions(1000, paye);
    assert.equal(d.tax, 0);
    assert.equal(d.ni, 0);
    assert.equal(d.net, 1000);
});

test("£2,000 gross, no pension: tax and NI are positive and net adds up", () => {
    const d = deductions(2000, paye);
    assert.ok(d.tax > 0);
    assert.ok(d.ni > 0);
    assert.ok(Math.abs(d.net - (2000 - d.tax - d.ni)) < 0.001);
});

test("BR code taxes everything at 20%", () => {
    const d = deductions(1000, { ...paye, taxCode: "BR" });
    assert.equal(d.tax, 200);
});

test("pension is a percentage of qualifying earnings only", () => {
    const d = deductions(2000, { ...paye, pensionPct: 5 });
    assert.equal(d.pension, (2000 - 520) * 0.05);
});