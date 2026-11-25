const range = (min, max, ideal) => ({ min, max, ideal });
const profile = { Ca: 100, Mg: 12, Na: 0, SO4: 25, Cl: 50, HCO3: 122, pH: 7.5, chlorine: 2, chlorType: 'chloramine' };
const target = {
  Ca: range(50, 100, 75), Mg: range(0, 20, 10), Na: range(0, 40, 15),
  SO4: range(100, 200, 150), Cl: range(40, 90, 60), HCO3: range(0, 120, 60)
};

export const legacy = {
  unit: 'gal', batchGal: 5, scaleStep: 0.1,
  startName: 'Home tap', start: profile,
  targetPreset: 'custom:1', target: { ...target, Ca: range(60, 115, 85) },
  adds: { gypsum: 6, cacl2: 1.5, distilled: 1 },
  enabled: { gypsum: true, cacl2: false, distilled: true },
  drawer: {
    gypsum: { owned: true, unlimited: false, stock: 8 },
    cacl2: { owned: true, unlimited: true, stock: 0 },
    distilled: { owned: true, unlimited: false, stock: 3 },
    kmeta: { owned: true, unlimited: false, stock: 0.25 }
  },
  dechlor: { mode: 'kmeta', enabled: true, rateMgGal: 30 },
  savedStarts: [{ name: 'Home tap', profile }, { name: 'Well', profile: { ...profile, Ca: 135 } }],
  customPresets: [
    { name: 'House lager', kind: 'Custom', blurb: 'Soft water', target },
    { name: 'House ale', kind: 'Custom', blurb: 'Balanced', target }
  ]
};

export async function seedLegacy(context, baseURL, data = legacy) {
  await context.addInitScript(({ value, origin }) => {
    if (location.origin === origin && !localStorage.getItem('wcStaticV1')) {
      localStorage.setItem('wcStaticV1', JSON.stringify(value));
    }
  }, { value: data, origin: new URL(baseURL).origin });
}
