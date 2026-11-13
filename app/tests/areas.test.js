import test from "node:test";
import assert from "node:assert/strict";
import { ALL, OUTSIDE, norm, labelOf, resolveArea, searchAreas, areaByCode } from "../src/core/areas.js";

test("the list has every UK council once", () => {
  assert.equal(ALL.length, 361);
  assert.equal(new Set(ALL.map(a => a.code)).size, ALL.length);
  assert.equal(new Set(ALL.map(a => a.label)).size, ALL.length);
  assert.ok(ALL.every(a => /^[ESWN]\d{8}$/.test(a.code)));
});

test("districts show their county, unitaries stand alone", () => {
  assert.equal(resolveArea("Charnwood").label, "Charnwood, Leicestershire");
  assert.equal(resolveArea("Leicester").label, "Leicester");
  assert.equal(labelOf({ name: "Adur", county: "West Sussex" }), "Adur, West Sussex");
});

test("councils that merged in 2019 to 2023 are the new ones", () => {
  for (const n of ["Somerset", "North Yorkshire", "Cumberland", "Westmorland and Furness", "Dorset", "Buckinghamshire", "North Northamptonshire", "West Northamptonshire"])
    assert.ok(resolveArea(n), n + " missing");
  assert.equal(resolveArea("Taunton"), null);
});

test("typing finds councils, best matches first", () => {
  assert.equal(searchAreas("leic")[0].name, "Leicester");
  assert.ok(searchAreas("char").some(a => a.name === "Charnwood"));
  assert.ok(searchAreas("hull").some(a => a.name === "Kingston upon Hull"));
  assert.ok(searchAreas("  LEICESTERSHIRE ").every(a => a.county === "Leicestershire" || /leicester/i.test(a.name)));
  assert.equal(searchAreas("").length, 0);
  assert.equal(searchAreas("zzzz").length, 0);
});

test("common alternative names work", () => {
  assert.equal(searchAreas("western isles")[0].name, "Eilean Siar");
  assert.equal(searchAreas("derry")[0].name, "Derry City and Strabane");
  assert.equal(searchAreas("edinburgh")[0].name, "City of Edinburgh");
});

test("outside the UK is always available", () => {
  assert.ok(searchAreas("abroad").includes(OUTSIDE));
  assert.equal(resolveArea("outside the uk"), OUTSIDE);
  assert.equal(areaByCode("OUTSIDE"), OUTSIDE);
});

test("resolveArea only accepts what is on the list", () => {
  assert.equal(resolveArea("Leicster"), null);
  assert.equal(resolveArea(""), null);
  assert.equal(resolveArea("charnwood, leicestershire").code, resolveArea("Charnwood").code);
});

test("norm ignores case, accents, punctuation and ampersands", () => {
  assert.equal(norm("  Bath & North-East Somerset "), "bath and north east somerset");
});
