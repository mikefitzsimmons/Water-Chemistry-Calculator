import { mmolPerUnit } from './catalog.js';

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
    if (!dose || !ingredient.mass) continue;
    for (const [key, mg] of Object.entries(ingredient.mass)) {
      if (profile[key] != null) profile[key] += dissolvedContribution(dose, mg, batchL);
    }
    if (profile.HCO3 != null && (ingredient.base || ingredient.pKs)) {
      const equivalents = ingredient.base ?? -1;
      profile.HCO3 += dose * mmolPerUnit(ingredient) * equivalents * 61 / batchL;
    }
  }
  if (profile.HCO3 < 0) profile.HCO3 = 0;
  return { profile, volumes };
}
