import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHistory } from '../../src/history.js';

test('commits isolated snapshots and keeps redo through equivalent edits', () => {
  const state = { drawer: { stock: 4 }, dose: 6 };
  const history = createHistory(state);
  state.drawer.stock = 2;
  assert.equal(history.commit(state), true);
  state.dose = 2;
  assert.equal(history.commit(state), true);
  assert.deepEqual(history.undo(), { drawer: { stock: 2 }, dose: 6 });
  assert.equal(history.commit({ dose: 6, drawer: { stock: 2 } }), false);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(), { drawer: { stock: 2 }, dose: 2 });
  const prior = history.undo();
  prior.drawer.stock = 8;
  assert.deepEqual(history.undo(), { drawer: { stock: 4 }, dose: 6 });
  assert.deepEqual(history.redo(), { drawer: { stock: 2 }, dose: 6 });
  assert.equal(history.commit(prior), true);
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(), null);
});
