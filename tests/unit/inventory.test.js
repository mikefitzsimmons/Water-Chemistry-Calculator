import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState } from '../../src/data.js';
import { INGREDIENTS, ingredientById } from '../../src/catalog.js';
import { doseGrid, doseAt, shortfalls, snapDose } from '../../src/inventory.js';
import { gallonsToLiters } from '../../src/units.js';

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
  state.adds.gypsum = 0;
  assert.deepEqual(shortfalls(state, INGREDIENTS), []);
});

test('a physical all-distilled endpoint is selectable with enough stock', () => {
  const state = defaultState();
  state.unit = 'L';
  state.batchL = 2.05;
  const distilled = ingredientById('distilled');
  const grid = doseGrid(state, distilled);
  assert.equal(grid.step, 0.1);
  assert.equal(doseAt(grid, grid.last), state.batchL);
  assert.equal(snapDose(state, distilled, 100), state.batchL);
  assert.equal(snapDose(state, distilled, 100, 0.25), 0.2);
});

test('gallon dilution uses 8-ounce steps and preserves an exact 5-gallon stock cap', () => {
  const state = defaultState();
  state.batchL = gallonsToLiters(6);
  const distilled = ingredientById('distilled');
  const fiveGallons = gallonsToLiters(5);
  Object.assign(state.drawer.distilled, { unlimited: false, stock: fiveGallons });
  const grid = doseGrid(state, distilled);
  assert.equal(grid.step, gallonsToLiters(1 / 16));
  assert.equal(grid.last, 80);
  assert.equal(snapDose(state, distilled, state.batchL), fiveGallons);
  assert.equal(snapDose(state, distilled, state.batchL, fiveGallons - 5e-10), gallonsToLiters(4 + 15 / 16));
  assert.equal(snapDose(state, distilled, state.batchL, gallonsToLiters(3 / 16)), gallonsToLiters(3 / 16));

  state.unit = 'L';
  assert.equal(snapDose(state, distilled, state.batchL), 18.9);
  assert.equal(state.drawer.distilled.stock, fiveGallons);
});
