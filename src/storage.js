export const LEGACY_KEY = 'wcStaticV1';
export const STORAGE_KEY = 'wcStaticV2';
export const VERSION = 2;

export const newId = () => crypto.randomUUID();

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string';
const quantity = value => Number.isFinite(value) && value >= 0;
const nullable = (value, valid) => value === null || valid(value);
const profileKeys = ['Ca', 'Mg', 'Na', 'SO4', 'Cl', 'HCO3'];
const targetKeys = profileKeys;

function validProfile(value) {
  return object(value) && profileKeys.every(key => nullable(value[key], quantity)) &&
    nullable(value.pH, n => quantity(n) && n <= 14) && nullable(value.chlorine, quantity) &&
    ['none', 'chlorine', 'chloramine'].includes(value.chlorType);
}

function validTarget(value) {
  return object(value) && targetKeys.every(key => {
    const r = value[key];
    return object(r) && [r.min, r.ideal, r.max].every(quantity) && r.min <= r.ideal && r.ideal <= r.max;
  });
}

function validRecords(records, valid) {
  return Array.isArray(records) && records.every(entry =>
    object(entry) && /^[\w-]+$/.test(entry.id ?? '') && text(entry.name) && entry.name.trim() && valid(entry)
  ) && new Set(records.map(entry => entry.id)).size === records.length;
}

function validate(state, defaults) {
  const keys = Object.keys(defaults.drawer);
  if (!(object(state) && ['gal', 'L'].includes(state.unit) && quantity(state.batchGal) && state.batchGal > 0 &&
    [0.01, 0.05, 0.1, 0.5, 1].includes(state.scaleStep) && text(state.startName) &&
    validProfile(state.start) && text(state.targetPreset) && validTarget(state.target) &&
    validRecords(state.savedStarts, entry => validProfile(entry.profile)) &&
    validRecords(state.customPresets, entry => validTarget(entry.target) && text(entry.blurb)) &&
    (!state.targetPreset.startsWith('custom:') ||
      state.customPresets.some(entry => 'custom:' + entry.id === state.targetPreset)) &&
    object(state.adds) && object(state.enabled) && object(state.drawer) &&
    keys.every(key => quantity(state.adds[key]) && typeof state.enabled[key] === 'boolean' &&
      object(state.drawer[key]) && quantity(state.drawer[key].stock) &&
      typeof state.drawer[key].owned === 'boolean' && typeof state.drawer[key].unlimited === 'boolean') &&
    object(state.dechlor) && ['kmeta', 'campden'].includes(state.dechlor.mode) &&
    quantity(state.dechlor.rateMgGal) && typeof state.dechlor.enabled === 'boolean')) {
    throw new Error('The backup contains invalid calculator data.');
  }
  return state;
}

function legacyProfile(value) {
  return {
    ...Object.fromEntries(profileKeys.map(key => [key, value[key] ?? null])),
    pH: value.pH ?? null,
    chlorine: value.chlorine ?? null,
    chlorType: value.chlorType ?? 'none'
  };
}

function legacyTarget(value) {
  return Object.fromEntries(targetKeys.map(key => {
    const { min, max, ideal } = value[key];
    return [key, { min, max, ideal: Math.max(min, Math.min(ideal, max)) }];
  }));
}

export function migrateLegacy(record, defaults) {
  if (!object(record)) throw new Error('The prototype save is invalid.');
  const state = {
    ...structuredClone(defaults),
    ...record,
    adds: { ...defaults.adds, ...record.adds },
    enabled: { ...defaults.enabled, ...record.enabled },
    drawer: { ...structuredClone(defaults.drawer), ...structuredClone(record.drawer ?? {}) },
    dechlor: { ...defaults.dechlor, ...record.dechlor },
    start: record.start ? legacyProfile(record.start) : structuredClone(defaults.start),
    target: record.target ? legacyTarget(record.target) : structuredClone(defaults.target),
    savedStarts: (record.savedStarts ?? []).map((entry, i) =>
      ({ ...entry, id: 'start-' + i, profile: legacyProfile(entry.profile) })),
    customPresets: (record.customPresets ?? []).map((entry, i) =>
      ({ ...entry, id: 'target-' + i, blurb: entry.blurb ?? '', target: legacyTarget(entry.target) }))
  };
  if (state.targetPreset.startsWith('custom:')) {
    const entry = state.customPresets[Number(state.targetPreset.slice(7))];
    state.targetPreset = entry ? 'custom:' + entry.id : '__customised';
  }
  if (record.drawer?.kmeta) state.drawer.kmeta.stock *= 1000;
  return validate(state, defaults);
}

export function encodeBackup(state) {
  return JSON.stringify({ version: VERSION, data: state }, null, 2);
}

export function decodeBackup(raw, defaults) {
  const record = JSON.parse(raw);
  if (!object(record) || record.version !== VERSION) throw new Error('This backup version is unsupported.');
  return validate(record.data, defaults);
}

export function writeSave(getStorage, state) {
  try {
    getStorage().setItem(STORAGE_KEY, encodeBackup(state));
    return true;
  } catch {
    return false;
  }
}

export function readSave(getStorage, defaults) {
  try {
    const storage = getStorage();
    const current = storage.getItem(STORAGE_KEY);
    if (current !== null) return { state: decodeBackup(current, defaults), status: 'saved' };
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy === null) return { state: defaults, status: 'ready' };
    const state = migrateLegacy(JSON.parse(legacy), defaults);
    return { state, status: writeSave(getStorage, state) ? 'migrated' : 'unavailable' };
  } catch {
    return { state: defaults, status: 'unavailable' };
  }
}
