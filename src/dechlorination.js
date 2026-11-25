import { ingredientById, masses } from './catalog.js';
import { stockCap } from './inventory.js';

const K_META_MOLAR_MASS = ingredientById('kmeta').molarMass;
const MOLECULAR_WEIGHTS = { Cl2: 70.90, chlorine: 52.46, chloramine: 51.48 };

export function dechlorination(state, sourceL) {
  const settings = state.dechlor;
  const id = settings?.mode ?? 'kmeta';
  const unit = ingredientById(id)?.unit ?? 'mg';
  const base = { id, unit, required: 0, applied: 0, shortage: 0, sulfateMg: 0, chlorideMg: 0, acidMeq: 0 };
  if (!settings?.enabled) return { ...base, status: 'disabled' };
  const { chlorType, chlorBasis, chlorine } = state.start;
  if (sourceL === 0 || !chlorType || chlorType === 'none' || chlorine === 0) {
    return { ...base, status: 'none' };
  }

  const activeMgPerUnit = id === 'campden' ? settings.campdenMg : settings.assayPercent / 100;
  const missing = [];
  if (chlorine == null) missing.push('source disinfectant residual');
  if (!chlorBasis) missing.push('disinfectant reporting basis');
  if (!(activeMgPerUnit > 0)) missing.push(id === 'campden'
    ? 'potassium metabisulfite per tablet' : 'potassium metabisulfite assay');
  if (missing.length) return { ...base, status: 'missing', missing };

  // One mole of bisulfite reduces one mole of HOCl or NH2Cl.
  // Each mole of metabisulfite supplies two moles of bisulfite.
  const molarMass = MOLECULAR_WEIGHTS[chlorBasis === 'Cl2' ? 'Cl2' : chlorType];
  const residualMmol = sourceL * chlorine / molarMass;
  const step = ingredientById(id).step;
  const required = Math.ceil(residualMmol * K_META_MOLAR_MASS / (2 * activeMgPerUnit * step)) * step;
  const stock = stockCap(state, id);
  const applied = Math.min(required, Math.floor(stock / step) * step);
  const reacted = Math.min(residualMmol, 2 * applied * activeMgPerUnit / K_META_MOLAR_MASS);
  return {
    id, unit, required, applied, shortage: Math.max(0, required - stock),
    status: applied < required ? 'short' : 'treated',
    sulfateMg: reacted * masses.SO4,
    chlorideMg: reacted * masses.Cl,
    // Reference HOCl and NH2Cl reactions yield two and one proton equivalents, respectively.
    acidMeq: reacted * (chlorType === 'chloramine' ? 1 : 2)
  };
}
