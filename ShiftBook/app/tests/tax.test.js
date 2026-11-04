import test from "node:test";
import assert from "node:assert/strict";
import { parseTaxCode, deductions } from "../src/core/tax.js";

test("1257L gives the standard monthly allowance", () => {
    const c = parseTaxCode("1257L");
    assert.equal(c.kind, "std");
    assert.ok(Math.abs(c.freeM - 1048.25) < 1e-9);
});
test("flat, none and K codes", () => {
    assert.equal(parseTaxCode("BR").rate, 0.2);
    assert.equal(parseTaxCode("D0").rate, 0.4);
    assert.equal(parseTaxCode("D1").rate, 0.45);
    assert.equal(parseTaxCode("NT").kind, "none");
    assert.ok(parseTaxCode("K475").freeM < 0);
});
test("region prefixes and bad codes", () => {
    assert.equal(parseTaxCode("S1257L").region, "scotland");
    assert.equal(parseTaxCode("C1257L").region, "wales");
    assert.equal(parseTaxCode("nonsense").ok, false);
});
test("PAYE deductions on £2,000 a month", () => {
    const d = deductions(2000, { employment: "paye", taxCode: "1257L", pensionPct: 0, studentLoan: "" });
    assert.equal(d.tax, Math.floor(2000 - 1048.25) * 0.2);
    assert.ok(Math.abs(d.ni - (2000 - 1048) * 0.08) < 1e-9);
    assert.equal(d.sl, 0);
    assert.ok(Math.abs(d.net - (2000 - d.tax - d.ni)) < 1e-9);
});
test("pension uses qualifying earnings for PAYE", () => {
    const d = deductions(2000, { employment: "paye", taxCode: "1257L", pensionPct: 5, studentLoan: "" });
    assert.ok(Math.abs(d.pension - (2000 - 520) * 0.05) < 1e-9);
});
test("student loan plan 2 above threshold", () => {
    const d = deductions(3000, { employment: "paye", taxCode: "1257L", pensionPct: 0, studentLoan: "p2" });
    assert.ok(Math.abs(d.sl - (3000 - 2448) * 0.09) < 1e-9);
});
test("NT code pays no tax", () => {
    assert.equal(deductions(2000, { employment: "paye", taxCode: "NT", pensionPct: 0 }).tax, 0);
});