import { GAL } from './units.js';

const pubchem = id => 'https://pubchem.ncbi.nlm.nih.gov/compound/' + id;
const acidification = 'https://brewery.org/library/AcidifWaterAJD0497.html';
const chalkStudy = 'https://braukaiser.com/documents/effect_of_water_and_grist_on_mash_pH.pdf';
export const dechlorinationStudy = 'https://cdn.homebrewtalk.com/data/attach/663/663189-Chlorine-Chloramine-Removal.pdf';
export const masses = { Ca: 40.078, Mg: 24.305, Na: 22.98977, SO4: 96.06, Cl: 35.45 };

const solid = (id, name, formula, molarMass, maxPerGal, source, ions, extra = {}) => ({
  id, name, sub: formula, formula, molarMass, unit: 'g', step: 0.01, maxPerGal, source,
  mass: Object.fromEntries(Object.entries(ions).map(([ion, count]) =>
    [ion, 1000 * masses[ion] * count / molarMass])),
  ...extra
});

const acid = (id, name, formula, molarMass, pKs, source, liquid) => ({
  id, name, sub: formula, formula, molarMass, pKs, source,
  unit: liquid ? 'mL' : 'g', step: liquid ? 0.1 : 0.01, maxPerGal: liquid ? 1 : 2,
  mass: {}, ...liquid
});

// Bounds are per US gallon of treated water and scale with batch volume.
export const INGREDIENTS = [
  solid('gypsum', 'Gypsum', 'CaSO₄·2H₂O', 172.17, 3, pubchem(24928), { Ca: 1, SO4: 1 }),
  solid('cacl2-dihydrate', 'Calcium chloride dihydrate', 'CaCl₂·2H₂O', 147.01, 3,
    pubchem('10035-04-8'), { Ca: 1, Cl: 2 }),
  solid('cacl2-anhydrous', 'Calcium chloride anhydrous', 'CaCl₂', 110.98, 2,
    pubchem(5284359), { Ca: 1, Cl: 2 }),
  solid('epsom', 'Epsom salt', 'MgSO₄·7H₂O', 246.47, 3, pubchem(24843), { Mg: 1, SO4: 1 }),
  solid('mgcl2', 'Magnesium chloride', 'MgCl₂·6H₂O', 203.30, 3, pubchem(24644), { Mg: 1, Cl: 2 }),
  solid('nacl', 'Table salt', 'NaCl · non-iodized', 58.44, 1.5, pubchem(5234), { Na: 1, Cl: 1 }),
  solid('nahco3', 'Baking soda', 'NaHCO₃', 84.01, 2, pubchem(516892), { Na: 1 },
    { base: 1, carbon: 1 }),
  { id: 'chalk', name: 'Chalk', sub: 'CaCO₃ · dissolution varies', unit: 'g', step: 0.01,
    maxPerGal: 2, source: chalkStudy, inventoryOnly: true },
  solid('lime', 'Pickling lime', 'Ca(OH)₂', 74.09, 0.5, pubchem(6093208), { Ca: 1 }, { base: 2 }),
  solid('kcl', 'Potassium chloride', 'KCl', 74.55, 2, pubchem(4873), { Cl: 1 }),
  solid('khco3', 'Potassium bicarbonate', 'KHCO₃', 100.12, 2, pubchem(516893), {},
    { base: 1, carbon: 1 }),
  acid('citric', 'Citric acid', 'C₆H₈O₇ · anhydrous', 192.13, [3.14, 4.77, 6.39], acidification),
  acid('lactic', 'Lactic acid 88%', 'C₃H₆O₃ · 88% w/w', 90.08, [3.86], pubchem(612),
    { strength: 0.88, density: 1.214 }),
  acid('phosphoric', 'Phosphoric acid 85%', 'H₃PO₄ · 85% w/w', 97.99, [2.12, 7.20, 12.44],
    'https://docs.alliancechemical.com/tds/phosphoric-acid-85-usp-food-grade', { strength: 0.85, density: 1.685 }),
  { id: 'kmeta', name: 'Potassium metabisulfite', sub: 'K₂S₂O₅ · powder', unit: 'mg',
    step: 1, molarMass: 222.33, maxPerGal: 0, auto: 'kmeta', source: pubchem(28019) },
  { id: 'campden', name: 'Campden tablets', sub: 'Check the tablet label for formulation', unit: 'tablets',
    step: 1, maxPerGal: 0, auto: 'campden', source: dechlorinationStudy },
  { id: 'distilled', name: 'Distilled water', sub: 'Replaces part of the starting water', unit: 'L',
    step: 0.1, maxPerGal: GAL, auto: 'distilled', source: acidification }
];

export const ingredientById = id => INGREDIENTS.find(ingredient => ingredient.id === id);

export function mmolPerUnit(ingredient) {
  return 1000 * (ingredient.density ?? 1) * (ingredient.strength ?? 1) / ingredient.molarMass;
}
