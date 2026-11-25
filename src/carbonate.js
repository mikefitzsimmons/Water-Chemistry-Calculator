import { mmolPerUnit } from './catalog.js';

// Closed carbonate system at approximately 25 °C. Alkalinity uses a fixed pH 4.30
// endpoint with the pure-water blank subtracted. No gas exchange or precipitation.
export const ENDPOINT = 4.3;
const CARBONATE_K = [10 ** -6.38, 10 ** -10.33];
const KW = 1e-14;

function charge(h, constants) {
  let species = 1;
  let total = 1;
  let weighted = 0;
  for (let index = 0; index < constants.length; index++) {
    species *= constants[index] / h;
    total += species;
    weighted += (index + 1) * species;
  }
  return weighted / total;
}

export const acidCharge = (pH, pKs) => charge(10 ** -pH, pKs.map(pK => 10 ** -pK));
const endpointH = 10 ** -ENDPOINT;
const endpointCharge = charge(endpointH, CARBONATE_K);
const waterCharge = h => 1000 * (KW / h - h); // mmol/L

export function carbonateBalance(start, volumes, additions, strongAcidMeq = 0, includePH = true) {
  const { batchL, sourceL } = volumes;
  const fraction = sourceL / batchL;
  let addedCarbon = 0;
  let netBase = -strongAcidMeq / batchL;
  let endpoints = 0;
  const acids = [];
  for (const [g, dose] of additions) {
    if (!g.base && !g.pKs) continue;
    const mmol = dose * mmolPerUnit(g) / batchL;
    addedCarbon += mmol * (g.carbon ?? 0);
    netBase += mmol * (g.base ?? 0);
    if (g.pKs) {
      const constants = g.pKs.map(pK => 10 ** -pK);
      endpoints += mmol * charge(endpointH, constants);
      acids.push({ mmol, constants });
    }
  }
  const alkalinity = sourceL > 0 && start.Alk == null ? null
    : (start.Alk ?? 0) * fraction + 50 * (netBase - addedCarbon * endpointCharge - endpoints);
  if (!includePH) return { alkalinity, pH: null, missing: [], assumed: false };

  const missing = [];
  if (sourceL > 0) {
    if (start.pH == null) missing.push('source pH');
    if (start.Alk == null) missing.push('source alkalinity');
  }
  if (missing.length) return { alkalinity, pH: null, missing, assumed: false };

  let sourceCarbon = 0;
  let sourceCharge = 0;
  let assumed = sourceL < batchL || !!start.assumed;
  if (sourceL > 0) {
    const h = 10 ** -start.pH;
    const c = charge(h, CARBONATE_K);
    const excess = start.Alk / 50 - waterCharge(h);
    const slope = c - endpointCharge;
    if (slope <= 0 && Math.abs(excess) > 1e-8 && start.Alk > 0) {
      return { alkalinity, pH: null, missing: ['a compatible source pH and alkalinity pair'], assumed };
    }
    // Below reporting precision, a zero-carbon estimate can still preserve the reported pH.
    const dissolved = slope > 0 ? Math.max(0, excess / slope) : 0;
    assumed ||= dissolved === 0 && Math.abs(excess) > 1e-8;
    sourceCarbon = dissolved * fraction;
    sourceCharge = (dissolved * c + waterCharge(h)) * fraction;
  }

  const carbon = sourceCarbon + addedCarbon;
  const requiredCharge = sourceCharge + netBase;
  let low = 0;
  let high = 14;
  for (let step = 0; step < 34; step++) {
    const midpoint = (low + high) / 2;
    const h = 10 ** -midpoint;
    let total = carbon * charge(h, CARBONATE_K) + waterCharge(h);
    for (const acid of acids) total += acid.mmol * charge(h, acid.constants);
    if (total < requiredCharge) low = midpoint;
    else high = midpoint;
  }
  return { alkalinity, pH: (low + high) / 2, missing, assumed };
}
