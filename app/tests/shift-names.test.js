import test from "node:test";
import assert from "node:assert/strict";
import { cleanShiftName, checkShiftName, paidFor, workKind, FIXED_SHIFTS } from "../src/core/shiftNames.js";

test("typed shift names are tidied", () => {
    assert.equal(cleanShiftName("  twilight   shift "), "Twilight shift");
    assert.equal(cleanShiftName("LD"), "LD");
    assert.equal(cleanShiftName(""), "");
    assert.equal(cleanShiftName("x".repeat(40)).length, 30);
});

test("a shift name can't be blank, repeated or one of the built-in shifts", () => {
    assert.deepEqual(checkShiftName("   ", []), { error: "Type a shift name first." });
    assert.deepEqual(checkShiftName("--", []), { error: "Use letters or numbers in the shift name." });
    assert.deepEqual(checkShiftName("long day", ["Long day"]), { error: "Long day is already in your list." });
    assert.deepEqual(checkShiftName("sleep-in", []), { error: "Sleep-in is already in your list." });
    assert.deepEqual(checkShiftName("waking NIGHT", []), { error: "Waking night is already in your list." });
    assert.deepEqual(checkShiftName("twilight", ["Long day"]), { name: "Twilight" });
});

test("no more than 12 typed shifts", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => "Shift " + i);
    assert.match(checkShiftName("One more", twelve).error, /up to 12/);
});

test("Waking night and Sleep-in are always there, and their pay is set", () => {
    assert.deepEqual(FIXED_SHIFTS, ["Waking night", "Sleep-in"]);
    assert.equal(paidFor("Sleep-in"), "sleep");
    assert.equal(paidFor("Waking night"), "hours");
});

test("shifts people type are paid by the hour, without asking", () => {
    assert.equal(paidFor("Twilight"), "hours");
    assert.equal(paidFor("Long day"), "hours");
    assert.equal(paidFor("Long day + sleep-in"), "hours");
});

test("kind of work is read from what people type", () => {
    assert.equal(workKind("Support worker in supported living"), "care");
    assert.equal(workKind("Care assistant in a care home"), "care");
    assert.equal(workKind("Home carer"), "care");
    assert.equal(workKind("Warehouse picker"), "other");
    assert.equal(workKind("Factory line operator"), "other");
    assert.equal(workKind(""), "care");
});
