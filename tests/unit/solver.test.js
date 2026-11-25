import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState } from '../../src/data.js';
import { INGREDIENTS, ingredientById } from '../../src/catalog.js';
import { evaluate } from '../../src/evaluate.js';
import { diagnose, solveRecipe } from '../../src/solver.js';

const range = (min, ideal = min, max = ideal) => ({ min, ideal, max });
function recipe(target, ids) {
  const state = defaultState();
  state.startId = 'custom';
  state.batchL = 2;
  state.target = target;
  for (const g of INGREDIENTS) state.drawer[g.id].owned = ids.includes(g.id);
  return state;
}

test('matches independent exhaustive enumeration of a small discrete salt problem', () => {
  const state = recipe({ Ca: range(60, 67, 81), SO4: range(105, 110, 117) }, ['gypsum', 'cacl2-dihydrate']);
  for (const id of ['gypsum', 'cacl2-dihydrate']) Object.assign(state.drawer[id], { unlimited: false, stock: 0.5 });
  let best;
  for (let gypsum = 0; gypsum <= 5; gypsum++) {
    for (let dihydrate = 0; dihydrate <= 5; dihydrate++) {
      const Ca = (gypsum * 23.278155 + dihydrate * 27.262091) / 2;
      const SO4 = gypsum * 55.793692 / 2;
      const miss = (Math.max(0, 60 - Ca, Ca - 81) / 50) ** 2 +
        (Math.max(0, 105 - SO4, SO4 - 117) / 100) ** 2;
      const preferred = ((Ca - 67) / 50) ** 2 + ((SO4 - 110) / 100) ** 2;
      if (!best || miss < best.miss || miss === best.miss && preferred < best.preferred) {
        best = { gypsum, dihydrate, miss, preferred };
      }
    }
  }
  const solved = solveRecipe(state);
  assert.equal(solved.complete, true);
  assert.equal(solved.adds.gypsum, best.gypsum / 10);
  assert.equal(solved.adds['cacl2-dihydrate'], best.dihydrate / 10);
  assert.deepEqual(evaluate({ ...state, adds: solved.adds }).profile, solved.result.profile);
});

test('replaces an unavailable planned dose and recommends stock only when fit improves', () => {
  const state = recipe({ SO4: range(100, 112, 120), imaginary: range(10) }, ['gypsum']);
  state.adds.epsom = 30;
  Object.assign(state.drawer.gypsum, { unlimited: false, stock: 0.25 });
  const options = { ingredients: [ingredientById('gypsum'), ingredientById('epsom')] };
  const solved = solveRecipe(state, options);
  assert.equal(solved.adds.gypsum, 0.2);
  assert.equal(solved.adds.epsom, 0);
  assert.equal(solved.diagnostics[0].status, 'low');
  assert.equal(solved.diagnostics[1].status, 'unevaluated');
  assert.equal(solved.shopping.purchases[0].id, 'gypsum');
  assert.ok(solved.shopping.purchases[0].amount > 0);
  state.target = { Na: range(90) };
  assert.equal(solveRecipe(state, options).shopping, null);
});

test('selects full dilution for an exact target and scores the displayed pH recipe', () => {
  const dilution = recipe({ Ca: range(0) }, ['distilled']);
  dilution.batchL = 2.05;
  dilution.start.Ca = 100;
  assert.equal(solveRecipe(dilution).adds.distilled, 2.05);
  const acid = recipe({ pH: range(4.7, 5, 5.3) }, ['citric']);
  Object.assign(acid.start, { pH: 8.3, Alk: 100 });
  const solved = solveRecipe(acid);
  assert.equal(solved.diagnostics[0].status, 'in range');
  const fromDisplayed = evaluate({ ...acid, adds: { citric: Number(solved.adds.citric.toFixed(1)) } });
  assert.equal(fromDisplayed.chemistry.pH, solved.result.chemistry.pH);
});

test('has deterministic ties and reports a limited search honestly', () => {
  const salt = ingredientById('gypsum');
  const alternate = { ...salt, id: 'same' };
  const state = recipe({ SO4: range(27.896846) }, ['gypsum']);
  state.drawer.same = state.drawer.gypsum;
  const options = { ingredients: [salt, alternate] };
  const one = solveRecipe(state, options);
  assert.deepEqual(solveRecipe(state, options).adds, one.adds);
  assert.equal(one.adds.gypsum, 0);
  assert.equal(one.adds.same, 0.1);
  const limited = solveRecipe(defaultState(), { exactLimit: 1, searchLimit: 20 });
  assert.equal(limited.complete, false);
  assert.equal(limited.evaluated, 20);
  assert.deepEqual(limited.diagnostics, diagnose(limited.result, defaultState().target));
});
