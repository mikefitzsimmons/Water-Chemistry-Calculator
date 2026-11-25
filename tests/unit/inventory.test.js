import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState } from '../../src/data.js';
import { INGREDIENTS, ingredientById } from '../../src/catalog.js';
import { doseGrid, doseAt, shortfalls, snapDose } from '../../src/inventory.js';

test('new numeric or slider edits are capped at a measurable amount', () => {
  const state = defaultState();
  const gypsum = ingredientById('gypsum');
  assert.equal(snapDose(state, gypsum, 6), 6);
  Object.assign(state.drawer.gypsum, { unlimited: false, stock: 0.25 });
  assert.equal(snapDose(state, gypsum, 6), 0.2);
  state.drawer.gypsum.stock = 0;
  assert.equal(snapDose(state, gypsum, 6), 0);
  state.drawer.gypsum.owned = false;
  state.drawer.gypsum.stock = 8;
  assert.equal(snapDose(state, gypsum, 6), 0);
  state.adds.gypsum = 6;
  assert.deepEqual(shortfalls(state, INGREDIENTS), [{ id: 'gypsum', amount: 6 }]);
  state.enabled.gypsum = false;
  assert.deepEqual(shortfalls(state, INGREDIENTS), []);
});

test('a physical all-distilled endpoint is selectable with enough stock', () => {
  const state = defaultState();
  const distilled = ingredientById('distilled');
  const grid = doseGrid(state, distilled);
  assert.equal(doseAt(grid, grid.last), state.batchL);
  assert.equal(snapDose(state, distilled, 100), state.batchL);
  assert.equal(snapDose(state, distilled, 100, 0.25), 0.2);
});
