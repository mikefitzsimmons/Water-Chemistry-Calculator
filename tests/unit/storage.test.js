import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultState } from '../../src/data.js';
import { legacy } from '../fixtures/legacy.js';
import { decodeBackup, encodeBackup, LEGACY_KEY, readSave, STORAGE_KEY, writeSave } from '../../src/storage.js';

function setup() {
  const defaults = defaultState();
  const records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  return { defaults, records, storage, getStorage: () => storage };
}

test('fresh, legacy and current saves preserve zeros, active edits and the original record', () => {
  const { defaults, records, getStorage } = setup();
  assert.deepEqual(readSave(getStorage, defaults), { state: defaults, status: 'ready' });
  const original = JSON.stringify(legacy);
  records.set(LEGACY_KEY, original);
  const { state, status } = readSave(getStorage, defaults);
  assert.equal(status, 'migrated');
  assert.equal(state.start.Na, 0);
  assert.equal(state.start.Alk, 100);
  assert.equal(state.drawer['cacl2-dihydrate'].stock, 0);
  assert.equal(state.drawer['cacl2-anhydrous'].owned, false);
  assert.equal(state.adds['cacl2-dihydrate'], 1.5);
  assert.equal(state.enabled['cacl2-dihydrate'], false);
  assert.equal(state.drawer.kmeta.stock, 250);
  assert.equal(state.dechlor.rateMgGal, 30);
  assert.equal(state.targetPreset, 'custom:target-1');
  assert.equal(state.target.Ca.ideal, 85);
  assert.equal(state.customPresets[1].target.Ca.ideal, 75);
  assert.equal(records.get(LEGACY_KEY), original);
  assert.deepEqual(readSave(getStorage, defaults), { state, status: 'saved' });
  assert.deepEqual(decodeBackup(encodeBackup(state), defaults), state);
});

test('invalid backups are rejected and a failed save preserves the persisted record', () => {
  const { defaults, records, storage, getStorage } = setup();
  assert.equal(writeSave(getStorage, defaults), true);
  const before = records.get(STORAGE_KEY);
  assert.throws(() => decodeBackup('{', defaults));
  assert.throws(() => decodeBackup('{"version":99,"data":{}}', defaults), /version/);
  assert.throws(() => decodeBackup(encodeBackup({ ...defaults, adds: { gypsum: -1 } }), defaults), /invalid/);
  storage.setItem = () => { throw new Error('quota'); };
  assert.equal(writeSave(getStorage, { ...defaults, batchL: 8 }), false);
  assert.equal(records.get(STORAGE_KEY), before);
  assert.equal(readSave(() => { throw new Error('blocked'); }, defaults).status, 'unavailable');
});

test('updates older target limits while preserving active doses, the starting source and saved targets', () => {
  const { defaults, records, getStorage } = setup();
  const state = structuredClone(defaults);
  state.startId = 'ro';
  state.adds.gypsum = 3.5;
  state.target.Ca = { min: 100, ideal: 1e46, max: 1e47 };
  const saved = structuredClone(state.target);
  saved.Alk = { min: -1e47, ideal: 0, max: 1e47 };
  state.customPresets.push({ id: 'house', name: 'House target', blurb: '', target: saved });
  const raw = JSON.stringify({ version: 7, data: state });
  records.set(STORAGE_KEY, raw);
  const upgraded = readSave(getStorage, defaults).state;
  assert.equal(upgraded.startId, 'ro');
  assert.equal(upgraded.adds.gypsum, 3.5);
  assert.deepEqual(upgraded.target.Ca, { min: 100, ideal: 300, max: 300 });
  assert.deepEqual(upgraded.customPresets[0].target.Alk, { min: -330, ideal: 0, max: 330 });
  assert.equal(records.get(STORAGE_KEY), raw);
  assert.deepEqual(decodeBackup(encodeBackup(upgraded), defaults), upgraded);
  assert.throws(() => decodeBackup(encodeBackup(state), defaults), /invalid/);
});
