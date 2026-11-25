import { IONS } from './data.js';

const secondaryStandards = 'https://www.epa.gov/sdwa/secondary-drinking-water-standards-guidance-nuisance-chemicals';

export function targetLimits(key) {
  if (key === 'pH') return { min: 0, max: 14 };
  const max = IONS.find(ion => ion.id === key).ceil;
  return { min: key === 'Alk' ? -max : 0, max };
}

export function validTargetRange(key, range, limits = targetLimits(key)) {
  if (!range || typeof range !== 'object') return false;
  const { min, ideal, max } = range;
  return [min, ideal, max].every(Number.isFinite) &&
    limits.min <= min && min <= ideal && ideal <= max && max <= limits.max;
}

export function targetAdvisories(target) {
  const notes = [];
  if (target.SO4.max > 500) {
    notes.push({ text: 'Sulfate maximum exceeds the EPA’s 500 mg/L health advisory for drinking water.',
      source: 'https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=20003KBY.TXT' });
  } else if (target.SO4.max > 250) {
    notes.push({ text: 'Sulfate maximum exceeds the EPA’s 250 mg/L taste guideline for drinking water.', source: secondaryStandards });
  }
  if (target.Cl.max > 250) {
    notes.push({ text: 'Chloride maximum exceeds the EPA’s 250 mg/L taste guideline for drinking water.', source: secondaryStandards });
  }
  if (target.Na.max > 60) {
    notes.push({ text: 'Sodium maximum exceeds the EPA’s 60 mg/L upper taste reference for drinking water.',
      source: 'https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=20003KAK.TXT' });
  }
  if (target.pH?.max > 8.5) {
    notes.push({ text: 'pH maximum exceeds 8.5, the upper end of the EPA’s secondary drinking-water range.', source: secondaryStandards });
  }
  return notes;
}
