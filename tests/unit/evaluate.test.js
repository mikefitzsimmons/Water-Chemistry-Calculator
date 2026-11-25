import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate } from '../../src/evaluate.js';
import { fromVolumeDisplay, toVolumeDisplay } from '../../src/units.js';

test('mixes 8 L at 100 mg/L with 2 L distilled and preserves unknown values', () => {
  const state = { batchL: 10, start: { Ca: 100, Mg: null, Na: 0 }, adds: { distilled: 2 } };
  const result = evaluate(state, [], ['Ca', 'Mg', 'Na']);
  assert.deepEqual(result.volumes, { batchL: 10, sourceL: 8, dilutionL: 2 });
  assert.deepEqual(result.profile, { Ca: 80, Mg: null, Na: 0 });
  state.adds.distilled = 0;
  assert.equal(evaluate(state, [], ['Ca']).profile.Ca, 100);
  state.adds.distilled = 10;
  assert.deepEqual(evaluate(state, [], ['Ca', 'Mg', 'Na']).profile, { Ca: 0, Mg: 0, Na: 0 });
});

test('volume display conversions round trip independently of recipe doses', () => {
  const liters = fromVolumeDisplay(5, 'gal');
  assert.equal(toVolumeDisplay(liters, 'gal'), 5);
  assert.equal(toVolumeDisplay(liters, 'L'), 18.92705892);
});
