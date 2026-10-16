import "./helpers/env.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { identityKey, releaseYear, prepareCards, COLORLESS } from "../core/index.js";
import * as legacy from "./legacy/legacy.js";

test("identityKey keeps WUBRG order regardless of input order", () => {
  assert.equal(identityKey(["U", "W"]), "WU");
  assert.equal(identityKey(["G", "B", "R", "U", "W"]), "WUBRG");
  assert.equal(identityKey(["R", "G"]), "RG");
});

test("identityKey of no colors is the Colorless label", () => {
  assert.equal(identityKey([]), COLORLESS);
  assert.equal(identityKey(undefined), COLORLESS);
  assert.equal(COLORLESS, "Colorless");
});

test("releaseYear reads the year from the ISO string", () => {
  assert.equal(releaseYear("1993-08-05"), 1993);
  assert.equal(releaseYear(""), null);
  assert.equal(releaseYear(undefined), null);
});

// Bug B5: `new Date("YYYY-01-01").getFullYear()` parses as UTC and reads local
// time, so west of UTC a 1 January release lands in the previous year.
test("B5: releaseYear is timezone independent (legacy is not)", () => {
  const saved = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const card = { release_date: "2019-01-01" };
    assert.equal(releaseYear(card.release_date), 2019);
    // Documents the legacy bug this replaces:
    assert.deepEqual(legacy.extractCardValues(card, "Year"), ["2018"]);
  } finally {
    process.env.TZ = saved;
  }
});

test("prepareCards adds derived fields once and keeps the original ones", () => {
  const cards = prepareCards([
    { index: 0, color_identity: ["U", "W"], release_date: "2001-01-01", originality: "Original", rarity: "Rare" },
    { index: 1, color_identity: [], release_date: "1994-05-01", originality: "reprint", rarity: "common" },
  ]);
  assert.equal(cards[0]._ci, "WU");
  assert.equal(cards[0]._nc, 2);
  assert.equal(cards[0]._year, 2001);
  assert.equal(cards[0]._orig, "original");
  assert.equal(cards[0]._rar, "rare");
  assert.equal(cards[1]._ci, COLORLESS);
  assert.equal(cards[1]._nc, 0);
  assert.equal(cards[0].originality, "Original", "source fields untouched");
  // Derived fields must not leak into JSON (e.g. saved files, OPFS).
  assert.equal(JSON.stringify(cards[1]).includes("_ci"), false);
});

test("prepareCards requires index === array position", () => {
  assert.throws(() => prepareCards([{ index: 1 }]), /index/);
});
