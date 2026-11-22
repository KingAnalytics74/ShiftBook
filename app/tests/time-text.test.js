import test from "node:test";
import assert from "node:assert/strict";
import { parseTimeText } from "../src/core/timeText.js";

test("typed times in 24-hour form", () => {
    assert.equal(parseTimeText("08:00"), "08:00");
    assert.equal(parseTimeText("8:30"), "08:30");
    assert.equal(parseTimeText("8.30"), "08:30");
    assert.equal(parseTimeText("20h30"), "20:30");
    assert.equal(parseTimeText(" 20 : 00 "), "20:00");
});

test("just the numbers", () => {
    assert.equal(parseTimeText("8"), "08:00");
    assert.equal(parseTimeText("08"), "08:00");
    assert.equal(parseTimeText("20"), "20:00");
    assert.equal(parseTimeText("0"), "00:00");
    assert.equal(parseTimeText("830"), "08:30");
    assert.equal(parseTimeText("0830"), "08:30");
    assert.equal(parseTimeText("2030"), "20:30");
});

test("am and pm", () => {
    assert.equal(parseTimeText("8pm"), "20:00");
    assert.equal(parseTimeText("8 PM"), "20:00");
    assert.equal(parseTimeText("8:30pm"), "20:30");
    assert.equal(parseTimeText("830am"), "08:30");
    assert.equal(parseTimeText("12am"), "00:00");
    assert.equal(parseTimeText("12pm"), "12:00");
    assert.equal(parseTimeText("7a"), "07:00");
});

test("midnight and noon", () => {
    assert.equal(parseTimeText("24:00"), "00:00");
    assert.equal(parseTimeText("24"), "00:00");
    assert.equal(parseTimeText("midnight"), "00:00");
    assert.equal(parseTimeText("noon"), "12:00");
});

test("blank is blank, nonsense can't be read", () => {
    assert.equal(parseTimeText(""), "");
    assert.equal(parseTimeText("   "), "");
    assert.equal(parseTimeText("25"), null);
    assert.equal(parseTimeText("8:75"), null);
    assert.equal(parseTimeText("13pm"), null);
    assert.equal(parseTimeText("0am"), null);
    assert.equal(parseTimeText("12345"), null);
    assert.equal(parseTimeText("eight"), null);
    assert.equal(parseTimeText("8:3"), null);
});
