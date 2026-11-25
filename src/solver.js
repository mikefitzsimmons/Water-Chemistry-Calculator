import { INGREDIENTS } from './catalog.js';
import { evaluate, PROFILE_KEYS, usesDilution } from './evaluate.js';
import { dechlorination } from './dechlorination.js';
import { doseAt, doseGrid, doseIndex, doseMaximum, stockCap } from './inventory.js';

const SCALES = { Ca: 50, Mg: 15, Na: 25, SO4: 100, Cl: 50, Alk: 50, pH: 0.5 };
const TOLERANCE = 1e-10;

const targets = target => Object.entries(target).filter(([, range]) => range != null);
const values = result => ({ ...result.profile, pH: result.chemistry.pH });

export function diagnose(result, target) {
  const measured = values(result);
  return targets(target).map(([key, range]) => {
    const value = measured[key] ?? null;
    if (value === null) return { key, value, status: 'unevaluated', difference: null };
    const low = range.min - value;
    const high = value - range.max;
    if (low > TOLERANCE) return { key, value, status: 'low', difference: low };
    if (high > TOLERANCE) return { key, value, status: 'high', difference: high };
    return { key, value, status: 'in range', difference: 0 };
  });
}

function distance(result, entries, priority) {
  const measured = values(result);
  let range = 0;
  let preferred = 0;
  let protectedLoss = 0;
  let targetLoss = 0;
  for (const [key, target] of entries) {
    const value = measured[key];
    const scale = SCALES[key] ?? 1;
    const miss = value == null ? 1 : (Math.max(0, target.min - value, value - target.max) / scale) ** 2;
    range += miss;
    if (priority?.protectedKeys.has(key)) protectedLoss += miss;
    if (priority?.key === key) targetLoss = miss;
    if (value != null) preferred += ((value - target.ideal) / scale) ** 2;
  }
  return { range, preferred, protectedLoss, targetLoss };
}

function compareDistance(a, b) {
  for (const key of ['protectedLoss', 'targetLoss', 'range']) {
    const difference = a[key] - b[key];
    if (Math.abs(difference) > TOLERANCE) return difference;
  }
  return a.preferred - b.preferred;
}

function compare(a, b) {
  const score = compareDistance(a, b);
  if (Math.abs(score) > TOLERANCE) return score;
  if (a.active !== b.active) return a.active - b.active;
  if (a.steps !== b.steps) return a.steps - b.steps;
  for (let i = 0; i < a.indices.length; i++) {
    if (a.indices[i] !== b.indices[i]) return a.indices[i] - b.indices[i];
  }
  return 0;
}

const adjustable = (state, g) => !g.inventoryOnly &&
  (g.mass || g.id === 'distilled' && usesDilution(state));

function boundedSearch(state, ingredients, exactLimit, searchLimit, priority) {
  const entries = targets(state.target);
  const includePH = entries.some(([key]) => key === 'pH');
  const working = { ...state, adds: { ...state.adds } };
  const dimensions = [];
  for (const g of ingredients) {
    if (g.inventoryOnly) working.adds[g.id] = 0;
    if (!adjustable(state, g)) continue;
    const grid = doseGrid(state, g);
    working.adds[g.id] = 0;
    if (grid.last > 0) dimensions.push({ id: g.id, grid });
  }

  let best;
  let evaluated = 0;
  const maxima = dimensions.map(({ grid }) => grid.last);
  const zero = maxima.map(() => 0);
  const total = maxima.reduce((product, last) => product * (last + 1), 1);
  const complete = total <= exactLimit;
  const budget = complete ? total : Math.max(1, searchLimit);

  function probe(indices) {
    if (evaluated >= budget) return null;
    evaluated++;
    let active = 0;
    let steps = 0;
    for (const [i, { id, grid }] of dimensions.entries()) {
      const index = indices[i];
      working.adds[id] = doseAt(grid, index);
      active += Number(index > 0);
      steps += index;
    }
    const result = evaluate(working, ingredients, PROFILE_KEYS, includePH);
    const candidate = { ...distance(result, entries, priority), active, steps, indices: [...indices] };
    if (!best || compare(candidate, best) < 0) best = candidate;
    return candidate;
  }

  if (complete) {
    const indices = [...zero];
    for (let iteration = 0; iteration < total; iteration++) {
      probe(indices);
      for (let i = indices.length - 1; i >= 0; i--) {
        if (++indices[i] <= maxima[i]) break;
        indices[i] = 0;
      }
    }
  } else {
    const prior = dimensions.map(({ id, grid }) => doseIndex(grid, state.adds[id] ?? 0));
    const dilution = dimensions.findIndex(({ id }) => id === 'distilled');
    const allDistilled = zero.map((value, i) => i === dilution ? maxima[i] : value);
    const middle = maxima.map(max => Math.round(max / 3));
    const order = maxima.map((_, index) => index);

    for (const [seedIndex, seed] of [prior, zero, allDistilled, middle].entries()) {
      let current = probe(seed);
      if (!current) break;
      const ordered = seedIndex % 2 ? [...order].reverse() : order;
      for (const divisions of [12, 30, 100, 300, Infinity]) {
        for (let pass = 0; pass < 2; pass++) {
          const start = current;
          for (const i of ordered) {
            const max = maxima[i];
            const at = current.indices[i];
            const step = Math.max(1, Math.round(max / divisions));
            const options = [0, max, at - 3 * step, at - step, at + step, at + 3 * step];
            if (divisions === 12) {
              for (let j = 1; j < 12; j++) options.push(Math.round(max * j / 12));
            }
            for (const index of new Set(options)) {
              if (index < 0 || index > max || index === at) continue;
              const trial = [...current.indices];
              trial[i] = index;
              const candidate = probe(trial);
              if (candidate && compare(candidate, current) < 0) current = candidate;
            }
          }
          if (current === start) break;
        }
      }
    }

    // Check paired moves that a one-ingredient sweep can miss.
    for (const divisor of [30, 100, 300, Infinity]) {
      const origin = best;
      for (let i = 0; i < dimensions.length && evaluated < budget; i++) {
        for (let j = i + 1; j < dimensions.length && evaluated < budget; j++) {
          const stepI = Math.max(1, Math.round(maxima[i] / divisor));
          const stepJ = Math.max(1, Math.round(maxima[j] / divisor));
          for (const signI of [-1, 1]) for (const signJ of [-1, 1]) {
            const trial = [...origin.indices];
            trial[i] += signI * stepI;
            trial[j] += signJ * stepJ;
            if (trial[i] >= 0 && trial[i] <= maxima[i] && trial[j] >= 0 && trial[j] <= maxima[j]) probe(trial);
          }
        }
      }
    }
  }

  dimensions.forEach(({ id, grid }, i) => { working.adds[id] = doseAt(grid, best.indices[i]); });
  const result = evaluate(working, ingredients);
  return { adds: working.adds, result, complete, evaluated, score: distance(result, entries) };
}

function affectedBy(ingredient, key) {
  if (ingredient.id === 'distilled') return PROFILE_KEYS.includes(key) || key === 'pH';
  if (ingredient.auto) return ['SO4', 'Cl', 'Alk', 'pH'].includes(key);
  if (ingredient.mass?.[key]) return true;
  return (key === 'Alk' || key === 'pH') && (ingredient.base || ingredient.pKs);
}

function availableForComparison(state, ingredients) {
  const limited = ingredients.filter(g => adjustable(state, g) && stockCap(state, g.id) < doseMaximum(state, g));
  const treatment = dechlorination(state, state.batchL);
  if (treatment.status === 'short') {
    const product = ingredients.find(g => g.id === treatment.id);
    if (product) limited.push(product);
  }
  return limited;
}

const doseIn = (recipe, id) => recipe.result.treatment.id === id
  ? recipe.result.treatment.applied : recipe.adds[id] ?? 0;
const allInRange = checks => checks.every(check => check.status === 'in range');

function adviceForStock(state, baseline, diagnostics, ingredients, exactLimit, comparisonLimit) {
  const candidates = availableForComparison(state, ingredients);
  const baselineChecks = new Map(diagnostics.map(check => [check.key, check]));
  const protectedKeys = new Set(diagnostics.filter(check => check.status === 'in range').map(check => check.key));
  const misses = diagnostics.filter(check => check.difference > 0);
  const ranges = misses.map(check => ({ key: check.key, options: [] }));
  const optional = [];
  let reference = allInRange(diagnostics) ? { recipe: baseline, checks: diagnostics, purchases: [], impact: 0 } : null;
  let remaining = comparisonLimit;

  function compareWithStock(origin, recipe, products, priority, limit) {
    const budget = Math.min(limit, remaining) - 1; // Include the final forward evaluation in the budget.
    if (budget < 1) return null;
    const drawer = { ...origin.drawer };
    for (const { id } of products) drawer[id] = { ...drawer[id], owned: true, unlimited: true };
    const alternative = boundedSearch({ ...origin, adds: recipe.adds, drawer }, ingredients,
      Math.min(exactLimit, budget), budget, priority);
    remaining -= alternative.evaluated + 1;
    const purchases = products.flatMap(({ id }) => {
      const dose = doseIn(alternative, id);
      const amount = dose - stockCap(origin, id);
      return amount > TOLERANCE ? [{ id, amount, dose }] : [];
    });
    if (!purchases.length) return null;
    const checks = diagnose(alternative.result, state.target);
    return { recipe: alternative, purchases, checks };
  }

  function keepRangeOption(before, options, comparison) {
    if (!comparison) return;
    const { recipe, purchases, checks } = comparison;
    const after = checks.find(check => check.key === before.key);
    if (after.difference === null || before.difference - after.difference <= TOLERANCE ||
        checks.some(check => protectedKeys.has(check.key) && check.status !== 'in range')) return;
    const changes = checks.filter(({ key, value }) => key !== before.key && value !== null &&
      (baselineChecks.get(key).value === null || Math.abs(value - baselineChecks.get(key).value) >= 0.01));
    // A fine-tuning reference should meet the ranges with minimal impact on the
    // values already in range, so the correction stays distinct from optional tuning.
    const impact = changes.reduce((sum, { key, value }) => protectedKeys.has(key)
      ? sum + Math.abs(value - baselineChecks.get(key).value) / (SCALES[key] ?? 1) : sum, 0);
    if (allInRange(checks) && (!reference || purchases.length < reference.purchases.length ||
        purchases.length === reference.purchases.length && impact < reference.impact - TOLERANCE)) {
      reference = { ...comparison, impact };
    }
    const doseChanges = ingredients.flatMap(({ id }) => {
      const dose = doseIn(recipe, id);
      return !purchases.some(item => item.id === id) && Math.abs(dose - doseIn(baseline, id)) > TOLERANCE
        ? [{ id, dose }] : [];
    });
    options.push({ purchases, after, changes, doseChanges });
  }

  const singleTrials = misses.flatMap((check, index) => candidates.filter(g => affectedBy(g, check.key))
    .map(product => ({ check, product, options: ranges[index].options })));
  const singleLimit = Math.floor(comparisonLimit / 2 / Math.max(1, singleTrials.length));
  for (const { check, product, options } of singleTrials) {
    keepRangeOption(check, options, compareWithStock(state, baseline, [product], { protectedKeys, key: check.key }, singleLimit));
  }

  const combinationRanges = reference
    ? ranges.filter(({ options }) => !options.some(option => option.after.status === 'in range')) : ranges;
  if (candidates.length > 1 && combinationRanges.length) {
    const reservedForOptional = Math.floor(comparisonLimit / 4);
    const combinationLimit = Math.floor((remaining - reservedForOptional) / combinationRanges.length);
    for (const { key, options } of combinationRanges) {
      if (!candidates.some(product => affectedBy(product, key))) continue;
      const comparison = compareWithStock(state, baseline, candidates, { protectedKeys, key }, combinationLimit);
      if (comparison?.purchases.length > 1 &&
          (allInRange(comparison.checks) || !options.some(option => option.after.status === 'in range'))) {
        keepRangeOption(baselineChecks.get(key), options, comparison);
      }
    }
  }

  if (reference) {
    const drawer = { ...state.drawer };
    for (const { id, dose } of reference.purchases) {
      drawer[id] = { ...drawer[id], owned: true, unlimited: false, stock: dose };
    }
    const rangeProducts = new Set(ranges.flatMap(({ options }) =>
      options.flatMap(option => option.purchases.map(({ id }) => id))));
    const products = candidates.filter(g => !rangeProducts.has(g.id));
    const optionalLimit = Math.floor(remaining / Math.max(1, products.length));
    const priority = { protectedKeys: new Set(reference.checks.map(check => check.key)) };
    for (const product of products) {
      const comparison = compareWithStock({ ...state, drawer }, reference.recipe, [product], priority, optionalLimit);
      if (!comparison || !allInRange(comparison.checks) ||
          comparison.recipe.score.preferred >= reference.recipe.score.preferred - TOLERANCE) continue;
      const improvements = comparison.checks.flatMap(after => {
        const { key } = after;
        if (!affectedBy(product, key)) return [];
        const before = reference.checks.find(check => check.key === key).value;
        const ideal = state.target[key].ideal;
        const gain = Math.abs(before - ideal) - Math.abs(after.value - ideal);
        return gain >= 0.01 ? [{ key, before, value: after.value, gain: gain / (SCALES[key] ?? 1) }] : [];
      }).sort((a, b) => b.gain - a.gain);
      if (improvements.length) optional.push({ purchase: comparison.purchases[0], ...improvements[0] });
    }
    optional.sort((a, b) => b.gain - a.gain);
  }

  for (const { options } of ranges) {
    options.sort((a, b) => a.after.difference - b.after.difference || a.purchases.length - b.purchases.length);
  }
  return { ranges: ranges.filter(range => range.options.length), optional, reference: reference?.purchases ?? [],
    evaluated: comparisonLimit - remaining };
}

export function solveRecipe(state, { ingredients = INGREDIENTS, exactLimit = 12000, searchLimit = 14000,
  comparisonLimit = 16000 } = {}) {
  const baseline = boundedSearch(state, ingredients, exactLimit, searchLimit);
  const diagnostics = diagnose(baseline.result, state.target);
  return {
    ...baseline,
    diagnostics,
    advice: adviceForStock(state, baseline, diagnostics, ingredients, exactLimit, comparisonLimit)
  };
}
