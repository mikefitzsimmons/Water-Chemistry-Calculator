import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState, presetById } from '../../src/data.js';
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
  assert.equal(solved.advice.ranges.length, 1);
  assert.equal(solved.advice.ranges[0].key, 'SO4');
  const gypsum = solved.advice.ranges[0].options.find(option => option.purchases[0].id === 'gypsum');
  assert.ok(gypsum.purchases[0].amount > 0);
  state.target = { Na: range(90) };
  assert.deepEqual(solveRecipe(state, options).advice.ranges, []);
});

test('distilled IPA distinguishes independent chloride fixes from optional magnesium tuning', () => {
  const state = recipe(presetById('ipa').target, ['gypsum']);
  state.startId = 'distilled';
  state.batchL = defaultState().batchL;
  const solved = solveRecipe(state, { comparisonLimit: 12000 });
  assert.deepEqual(solved.diagnostics.filter(check => check.status !== 'in range'), [
    { key: 'Cl', status: 'low', value: 0, difference: 25 }
  ]);
  assert.equal(solved.advice.evaluated <= 12000, true);
  const [{ key, options }] = solved.advice.ranges;
  assert.equal(key, 'Cl');
  assert.ok(options.length > 2);
  const tableSalt = options.find(option => option.purchases.some(item => item.id === 'nacl'));
  assert.equal(tableSalt.after.status, 'in range');
  assert.ok(tableSalt.changes.some(change => change.key === 'Na' && change.status === 'in range'));
  assert.ok(options.every(option => option.purchases.length === 1));
  assert.ok(!options.some(option => option.purchases.some(item => item.id === 'epsom')));
  const epsom = solved.advice.optional.find(option => option.purchase.id === 'epsom');
  assert.equal(epsom.key, 'Mg');
  assert.ok(Math.abs(epsom.value - state.target.Mg.ideal) < Math.abs(epsom.before - state.target.Mg.ideal));
  assert.ok(!solved.advice.optional.some(option => option.purchase.id === 'nacl'));
});

test('labels partial and combined stock options and protects targets already in range', () => {
  const makeChloride = (id, mass) => ({ id, mass, unit: 'g', step: 0.1, maxPerGal: 2 });
  const first = makeChloride('first', { Cl: 100 });
  const second = makeChloride('second', { Cl: 100, Na: 5 });
  const state = recipe({ Cl: range(75, 80, 90), Na: range(0, 0, 5) }, []);
  state.startId = 'distilled';
  state.batchL = 1;
  const { advice } = solveRecipe(state, { ingredients: [first, second] });
  const options = advice.ranges[0].options;
  assert.ok(options.some(option => option.after.status === 'low' && option.purchases.length === 1));
  assert.ok(options.some(option => option.after.status === 'in range' && option.purchases.length === 2));

  const sodium = makeChloride('sodium', { Na: 100 });
  state.target = { Cl: range(35, 40, 50), Na: range(35, 40, 50) };
  const complementary = solveRecipe(state, { ingredients: [first, sodium] });
  assert.ok(complementary.advice.ranges.every(group => group.options.some(option => option.purchases.length === 1)));
  assert.ok(complementary.advice.ranges.every(group => group.options.some(option => option.purchases.length === 2)));
  assert.equal(complementary.advice.reference.length, 2);

  const restrictive = recipe({ Cl: range(25, 45, 65), Na: range(0, 0, 5) }, []);
  restrictive.startId = 'distilled';
  const restricted = solveRecipe(restrictive, { ingredients: [ingredientById('nacl')] });
  assert.ok(restricted.advice.ranges.every(group => group.options.every(option => option.after.status === 'low')));
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
