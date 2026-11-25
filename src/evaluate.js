import { GAL } from './units.js';

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

export function evaluate(state, ingredients, keys) {
  const volumes = mixVolumes(state);
  const { batchL, sourceL } = volumes;
  const profile = Object.fromEntries(keys.map(key => {
    const source = state.start[key];
    return [key, sourceL === 0 ? 0 : source == null ? null : source * (sourceL / batchL)];
  }));
  for (const ingredient of ingredients) {
    const dose = effectiveDose(state, ingredient.id);
    if (!dose || !ingredient.per) continue;
    for (const [key, perGallon] of Object.entries(ingredient.per)) {
      if (profile[key] != null) profile[key] += dissolvedContribution(dose, perGallon * GAL, batchL);
    }
  }
  if (profile.HCO3 < 0) profile.HCO3 = 0;
  return { profile, volumes };
}
