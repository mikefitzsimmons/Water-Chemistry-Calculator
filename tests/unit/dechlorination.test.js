import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState } from '../../src/data.js';
import { dechlorination } from '../../src/dechlorination.js';
import { evaluate } from '../../src/evaluate.js';

function example() {
  const state = defaultState();
  state.batchL = 10;
  Object.assign(state.start, { chlorType: 'chlorine', chlorine: 3, chlorBasis: 'Cl2', Alk: 50 });
  return state;
}

test('3 mg/L as Cl2 needs 47.04 mg of pure powder for 10 L before rounding', () => {
  const state = example();
  const { treatment, profile } = evaluate(state);
  assert.equal(treatment.required, 48);
  assert.equal(treatment.applied, 48);
  assert.ok(Math.abs(profile.Cl - 1.5) < 1e-9);
  assert.ok(Math.abs(profile.SO4 - 4.06460) < 0.0001);
  assert.ok(Math.abs(profile.Alk - 45.76869) < 0.0001);
  state.start.chlorType = 'chloramine';
  assert.equal(dechlorination(state, 10).required, 48);
  assert.ok(Math.abs(evaluate(state).profile.Alk - 47.88434) < 0.0001);
  state.start.chlorBasis = 'compound';
  assert.equal(dechlorination(state, 10).required, 65);
  state.dechlor.assayPercent = 50;
  assert.equal(dechlorination(state, 10).required, 130);
});

test('uses recipe source volume and the actual measurable dose in the profile', () => {
  const state = example();
  state.adds.distilled = 5;
  assert.equal(evaluate(state).treatment.required, 24);
  Object.assign(state.drawer.kmeta, { unlimited: false, stock: 10.5 });
  const result = evaluate(state);
  assert.equal(result.treatment.applied, 10);
  assert.equal(result.treatment.shortage, 13.5);
  assert.ok(Math.abs(result.profile.Cl - 0.3189) < 0.0001);
  state.adds.distilled = 10;
  assert.equal(evaluate(state).treatment.status, 'none');
  state.enabled.distilled = false;
  assert.equal(evaluate(state).treatment.required, 48);
  state.dechlor.enabled = false;
  assert.equal(evaluate(state).profile.Cl, 0);
});

test('reports missing product formulation or residual and accepts a measured zero', () => {
  const state = example();
  state.dechlor.mode = 'campden';
  state.start.chlorine = null;
  assert.deepEqual(dechlorination(state, 10).missing,
    ['source disinfectant residual', 'potassium metabisulfite per tablet']);
  state.start.chlorine = 0;
  assert.equal(dechlorination(state, 10).status, 'none');
  state.start.chlorine = 3;
  state.dechlor.campdenMg = 400;
  assert.equal(dechlorination(state, 10).required, 1);
});
