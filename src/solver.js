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

function distance(result, entries) {
  const measured = values(result);
  let range = 0;
  let preferred = 0;
  for (const [key, target] of entries) {
    const value = measured[key];
    if (value == null) {
      range += 1;
      continue;
    }
    const scale = SCALES[key] ?? 1;
    const miss = Math.max(0, target.min - value, value - target.max);
    range += (miss / scale) ** 2;
    preferred += ((value - target.ideal) / scale) ** 2;
  }
  return { range, preferred };
}

function compareDistance(a, b) {
  const range = a.range - b.range;
  if (Math.abs(range) > TOLERANCE) return range;
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

const adjustable = (state, g) => state.enabled[g.id] && !g.inventoryOnly &&
  (g.mass || g.id === 'distilled' && usesDilution(state));

function boundedSearch(state, ingredients, exactLimit, searchLimit) {
  const entries = targets(state.target);
  const includePH = entries.some(([key]) => key === 'pH');
  const working = { ...state, adds: { ...state.adds } };
  const dimensions = [];
  for (const g of ingredients) {
    if (g.inventoryOnly && state.enabled[g.id]) working.adds[g.id] = 0;
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
    const candidate = { ...distance(result, entries), active, steps, indices: [...indices] };
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

function stockComparison(state, baseline, ingredients, exactLimit, searchLimit) {
  if (baseline.score.range <= TOLERANCE) return null;
  const drawer = { ...state.drawer };
  const limits = ingredients.filter(g => adjustable(state, g) && stockCap(state, g.id) < doseMaximum(state, g));
  const treatment = dechlorination(state, state.batchL);
  if (treatment.status === 'short') {
    const product = ingredients.find(g => g.id === treatment.id);
    if (product) limits.push(product);
  }
  if (!limits.length) return null;
  for (const { id } of limits) drawer[id] = { ...drawer[id], owned: true, unlimited: true };
  const alternate = boundedSearch({ ...state, adds: baseline.adds, drawer }, ingredients, exactLimit, searchLimit);
  if (alternate.score.range >= baseline.score.range - TOLERANCE) return null;

  const purchases = limits.flatMap(({ id }) => {
    const dose = id === alternate.result.treatment.id ? alternate.result.treatment.applied : alternate.adds[id];
    const amount = dose - stockCap(state, id);
    return amount > TOLERANCE ? [{ id, amount, dose }] : [];
  });
  if (!purchases.length) return null;
  return {
    purchases,
    diagnostics: diagnose(alternate.result, state.target),
    rangeImprovement: baseline.score.range - alternate.score.range,
    complete: alternate.complete
  };
}

export function solveRecipe(state, { ingredients = INGREDIENTS, exactLimit = 12000, searchLimit = 14000 } = {}) {
  const baseline = boundedSearch(state, ingredients, exactLimit, searchLimit);
  return {
    ...baseline,
    diagnostics: diagnose(baseline.result, state.target),
    shopping: stockComparison(state, baseline, ingredients, exactLimit, searchLimit)
  };
}
