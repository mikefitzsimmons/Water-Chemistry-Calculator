import { INGREDIENTS } from './catalog.js';
import { carbonateBalance } from './carbonate.js';

export const PROFILE_KEYS = ['Ca', 'Mg', 'Na', 'SO4', 'Cl', 'Alk'];

export function effectiveDose(state, id) {
  return state.enabled[id] ? state.adds[id] ?? 0 : 0;
}

export function mixVolumes(state) {
  const dilutionL = Math.min(state.batchL, Math.max(0, effectiveDose(state, 'distilled')));
  return { batchL: state.batchL, sourceL: state.batchL - dilutionL, dilutionL };
}

export function dissolvedContribution(amount, perUnitMg, batchL) {
  return amount * perUnitMg / batchL;
}

export function evaluate(state, ingredients = INGREDIENTS, keys = PROFILE_KEYS, includePH = true) {
  const volumes = mixVolumes(state);
  const { batchL, sourceL } = volumes;
  const profile = Object.fromEntries(keys.map(key => {
    const source = state.start[key];
    return [key, sourceL === 0 ? 0 : source == null ? null : source * (sourceL / batchL)];
  }));
  const additions = [];
  for (const ingredient of ingredients) {
    const dose = effectiveDose(state, ingredient.id);
    if (!dose || !ingredient.mass) continue;
    additions.push([ingredient, dose]);
    for (const [key, mg] of Object.entries(ingredient.mass)) {
      if (profile[key] != null) profile[key] += dissolvedContribution(dose, mg, batchL);
    }
  }
  const chemistry = carbonateBalance(state.start, volumes, additions, 0, includePH);
  if (keys.includes('Alk')) profile.Alk = chemistry.alkalinity;
  return { profile, volumes, chemistry };
}
