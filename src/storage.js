import { gallonsToLiters } from './units.js';

export const LEGACY_KEY = 'wcStaticV1';
export const STORAGE_KEY = 'wcStaticV2';
export const VERSION = 4;

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
  if (!(object(state) && ['gal', 'L'].includes(state.unit) && quantity(state.batchL) && state.batchL > 0 &&
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

function convertVolumes(state) {
  if (!object(state) || !Object.hasOwn(state, 'batchGal')) return state;
  const { batchGal, ...rest } = state;
  const result = { ...rest, batchL: gallonsToLiters(batchGal) };
  if (rest.adds?.distilled !== undefined) {
    result.adds = { ...rest.adds, distilled: gallonsToLiters(rest.adds.distilled) };
  }
  if (rest.drawer?.distilled) {
    result.drawer = { ...rest.drawer, distilled: {
      ...rest.drawer.distilled, stock: gallonsToLiters(rest.drawer.distilled.stock)
    } };
  }
  return result;
}

function convertForms(state, defaults) {
  if (!object(state?.adds) || !object(state.enabled) || !object(state.drawer)) return state;
  for (const key of ['adds', 'enabled', 'drawer']) {
    const entries = state[key];
    if (Object.hasOwn(entries, 'cacl2')) {
      entries['cacl2-dihydrate'] = entries.cacl2;
      delete entries.cacl2;
    }
    if (!Object.hasOwn(entries, 'cacl2-anhydrous')) {
      entries['cacl2-anhydrous'] = key === 'drawer'
        ? { ...defaults.drawer['cacl2-anhydrous'], owned: false, unlimited: false }
        : defaults[key]['cacl2-anhydrous'];
    }
  }
  return state;
}

export function migrateLegacy(record, defaults) {
  if (!object(record)) throw new Error('The prototype save is invalid.');
  record = convertVolumes(record);
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
  return validate(convertForms(state, defaults), defaults);
}

export function encodeBackup(state) {
  return JSON.stringify({ version: VERSION, data: state }, null, 2);
}

export function decodeBackup(raw, defaults) {
  const record = JSON.parse(raw);
  if (!object(record) || ![2, 3, VERSION].includes(record.version)) throw new Error('This backup version is unsupported.');
  if (record.version === VERSION) return validate(record.data, defaults);
  const state = record.version === 2 ? convertVolumes(record.data) : record.data;
  return validate(convertForms(state, defaults), defaults);
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
