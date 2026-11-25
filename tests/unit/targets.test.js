import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS, defaultState } from '../../src/data.js';
import { targetAdvisories, validTargetRange } from '../../src/targets.js';

test('target bounds accept built-in presets and reject invalid or unordered values', () => {
  for (const { target } of PRESETS) {
    for (const [key, range] of Object.entries(target)) {
      if (range) assert.ok(validTargetRange(key, range));
    }
  }
  assert.ok(validTargetRange('Alk', { min: -330, ideal: -50, max: 330 }));
  assert.equal(validTargetRange('Ca', { min: 0, ideal: 50, max: 1e47 }), false);
  assert.equal(validTargetRange('Mg', { min: 5, ideal: 15, max: 10 }), false);
  assert.equal(validTargetRange('pH', { min: 0, ideal: 7, max: 14.1 }), false);
});

test('warns only above evidence-based maximums and distinguishes taste and health guidance', () => {
  const { target } = defaultState();
  target.SO4.max = 250;
  target.Cl.max = 250;
  target.Na.max = 60;
  target.pH = { min: 5, ideal: 7, max: 8.5 };
  assert.deepEqual(targetAdvisories(target), []);
  target.SO4.max = 300;
  assert.match(targetAdvisories(target)[0].text, /250 mg\/L taste guideline/);
  target.SO4.max = 600;
  target.Cl.max = 251;
  target.Na.max = 61;
  target.pH.max = 9;
  const notes = targetAdvisories(target).map(({ text }) => text);
  assert.equal(notes.length, 4);
  assert.match(notes[0], /500 mg\/L health advisory/);
  assert.match(notes[1], /Chloride.*250 mg\/L taste guideline/);
  assert.match(notes[2], /Sodium.*60 mg\/L upper taste reference/);
  assert.match(notes[3], /pH.*8\.5/);
});
