import test from "node:test";
import assert from "node:assert/strict";
import { luckFor, probabilities } from "../src/game.js";
test("linear luck values", () => {
  assert.equal(luckFor(0), 0);
  for (let k = 1; k <= 10; k++) assert.equal(luckFor(k * 0.01), k * 100000);
});
test("zero-luck equal fallback", () => {
  const p = Array.from({ length: 1000 }, (_, id) => ({
    id,
    alive: true,
    luck: 0,
  }));
  const v = probabilities(p);
  assert.equal(v.get(1), 0.001);
  assert.ok(Math.abs([...v.values()].reduce((a, b) => a + b, 0) - 1) < 1e-12);
});
test("3-player example", () => {
  const p = [600000, 300000, 0].map((luck, id) => ({ id, luck, alive: true })),
    v = probabilities(p);
  assert.equal(v.get(0), 4 / 15);
  assert.equal(v.get(1), 1 / 3);
  assert.equal(v.get(2), 2 / 5);
});
test("sole luck holder has bounded protection; zero-luck finalist has hope", () => {
  const v = probabilities([
    { id: 1, luck: 1, alive: true },
    { id: 2, luck: 0, alive: true },
  ]);
  assert.equal(v.get(1), 1 / 3);
  assert.equal(v.get(2), 2 / 3);
});
test("queued deposits do not alter round odds", () => {
  const p = [
    { id: 1, luck: 100000, roundLuck: 0, alive: true },
    { id: 2, luck: 0, roundLuck: 0, alive: true },
  ];
  assert.equal(probabilities(p).get(1), 0.5);
  assert.equal(probabilities(p, { snapshot: false }).get(1), 1 / 3);
});
test("dead NFTs excluded and winner has no risk", () => {
  const v = probabilities([
    { id: 1, luck: 0, alive: true },
    { id: 2, luck: 100000, alive: false },
  ]);
  assert.equal(v.get(1), 0);
  assert.equal(v.has(2), false);
});
