import { INGREDIENTS } from './catalog.js';
import { alkAsCaCO3, gallonsToLiters } from './units.js';

export const IONS = [
  { id: 'Ca', name: 'Calcium', sym: 'Ca²⁺', ceil: 300 },
  { id: 'Mg', name: 'Magnesium', sym: 'Mg²⁺', ceil: 100 },
  { id: 'Na', name: 'Sodium', sym: 'Na⁺', ceil: 250 },
  { id: 'SO4', name: 'Sulfate', sym: 'SO₄²⁻', ceil: 800 },
  { id: 'Cl', name: 'Chloride', sym: 'Cl⁻', ceil: 350 },
  { id: 'Alk', name: 'Alkalinity', sym: 'as CaCO₃', ceil: 330 }
];

const brewingReference = 'https://www.brunwater.com/water-knowledge';
const burtonReference = 'https://www.cyberlibrary.org/en/books/cooley-s-cyclop-dia-of-practical-receipts-and-collateral-inform-4dfe3dab/chapters/83/';
const records = (ranges, bicarbonate = false) => ({
  ...Object.fromEntries(IONS.map(({ id }, index) => {
    const [min, ideal, max] = ranges[index];
    const convert = id === 'Alk' && bicarbonate ? alkAsCaCO3 : value => value;
    return [id, { min: convert(min), ideal: convert(ideal), max: convert(max) }];
  })),
  pH: null
});

const style = (id, name, blurb, ranges) =>
  ({ id, name, kind: 'Style', blurb, source: brewingReference, target: records(ranges) });

const historic = (id, name, blurb, nominal, bicarbonate = false, source = brewingReference) => ({
  id, name, kind: 'Historical', blurb, source,
  target: records(nominal.map(n => [Math.floor(n * 0.85), n, Math.ceil(n * 1.15)]), bicarbonate)
});

export const PRESETS = [
  style('pilsner', 'Pilsner', 'A soft, low-alkalinity starting point for a crisp pale lager.',
    [[20,35,50],[0,5,10],[0,5,15],[0,25,50],[10,30,55],[0,20,40]]),
  style('pale-ale', 'Pale Ale', 'Moderate calcium and a sulfate-forward balance for a dry finish.',
    [[50,75,100],[0,10,20],[0,15,40],[100,150,200],[30,50,75],[0,35,60]]),
  style('ipa', 'IPA', 'A sulfate-forward profile for a dry, hop-led IPA.',
    [[50,85,120],[0,10,20],[0,15,40],[200,250,350],[25,45,65],[0,30,60]]),
  style('stout', 'Stout', 'A starting range for a roast-heavy grist with enough acidity to use the added alkalinity.',
    [[50,75,100],[0,12,25],[0,25,50],[40,75,110],[40,75,100],[80,120,165]]),
  style('porter', 'Porter', 'Moderate alkalinity for dark malts and similar sulfate and chloride levels.',
    [[40,60,90],[0,10,20],[0,20,45],[35,60,90],[35,60,90],[60,95,140]]),
  style('wheat', 'Wheat Beer', 'A gently mineralized profile with moderate chloride and sulfate.',
    [[30,50,80],[0,10,20],[0,10,30],[25,45,75],[30,50,75],[0,35,65]]),
  historic('burton', 'Burton-on-Trent', 'Allsopp brewery well analysis in Cooley’s Cyclopædia, converted from grains per imperial gallon. High sulfate reflects the local gypsum.',
    [168,36,57,364,88,250], false, burtonReference),
  historic('dublin', 'Dublin', 'Brungard’s hard-water Dublin profile. Wells and Wicklow-supplied water differ considerably.',
    [120,4,12,55,19,315], true),
  historic('munich', 'Munich', 'Brungard’s Munich profile has low sulfate and chloride with substantial alkalinity.',
    [77,17,4,18,8,295], true),
  historic('vienna', 'Vienna', 'Brungard’s Vienna profile has moderate sulfate and substantial alkalinity.',
    [75,15,10,60,15,225], true)
];

export const presetById = id => PRESETS.find(preset => preset.id === id);

const pure = { Ca: 0, Mg: 0, Na: 0, SO4: 0, Cl: 0, Alk: 0, pH: 7 };
const source = (id, name, profile, description, reference) => ({
  id, name, description, reference,
  profile: { chlorType: 'none', chlorine: 0, chlorBasis: 'Cl2', alkBasis: 'CaCO3',
    assumed: id !== 'custom', ...profile }
});
export const STARTS = [
  source('distilled', 'Distilled', pure, 'Assumes zero reported minerals and neutral pH.'),
  source('ro', 'Reverse osmosis (estimate)', { Ca: 2, Mg: 0.5, Na: 3, SO4: 2, Cl: 4, Alk: 5, pH: 7 },
    'Editable estimates for low-mineral, unmineralized RO water. Use your report when available.',
    'https://www.epa.gov/system/files/documents/2025-01/ws-products-home-water-treatment-guide_v2_508.pdf'),
  source('spring', 'Bottled spring water (example)', { Ca: 67, Mg: 7.2, Na: 2.5, SO4: 9.1, Cl: 3, Alk: 190, pH: 7.3 },
    'Mountain Valley Spring 1, January 2023. Uses the midpoint of the reported pH interval.',
    'https://a-us.storyblok.com/f/1021132/x/c8dddc1da5/mountainvalley-spring-water-2023-water-quality-report.pdf'),
  source('custom', 'Water report', { ...Object.fromEntries(IONS.map(({ id }) => [id, null])), pH: null, chlorine: null },
    'Leave unreported measurements blank.')
];

export function defaultState() {
  return {
    unit: 'gal', batchL: gallonsToLiters(5), scaleStep: 0.1,
    startId: 'distilled', startName: 'Distilled', start: structuredClone(STARTS[0].profile),
    targetPreset: 'pale-ale', target: structuredClone(presetById('pale-ale').target),
    adds: Object.fromEntries(INGREDIENTS.map(g => [g.id, 0])),
    enabled: Object.fromEntries(INGREDIENTS.map(g => [g.id, true])),
    dechlor: { mode: 'kmeta', rateMgGal: null, enabled: true, assayPercent: 100, campdenMg: null },
    drawer: Object.fromEntries(INGREDIENTS.map(g => [g.id, { owned: true, unlimited: true, stock: 0 }])),
    savedStarts: [], customPresets: []
  };
}
