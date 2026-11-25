import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acidCharge, carbonateBalance } from '../../src/carbonate.js';
import { ingredientById } from '../../src/catalog.js';

const source = { pH: 8.3, Alk: 100 };
const full = { batchL: 1, sourceL: 1 };
const additions = (id, dose) => [[ingredientById(id), dose]];
function near(value, expected, tolerance = 0.00001) {
  assert.ok(Math.abs(value - expected) <= tolerance, `${value} vs ${expected}`);
}

test('reproduces untreated pH and the published citric acid example', () => {
  near(carbonateBalance(source, full, []).pH, 8.3);
  near(acidCharge(5, [3.14, 4.77, 6.39]), 1.655395);
  // deLange: 225.94 mg/L for 100 mg/L as CaCO3 at pH 8.3, endpoint 4.3.
  // The small tolerance allows for the water charge omitted in the hand calculation.
  near(carbonateBalance(source, full, additions('citric', 0.22594)).pH, 5, 0.04);
});

test('responds to acids, bases and dilution and preserves missing values', () => {
  const acid = carbonateBalance(source, full, additions('lactic', 0.1));
  assert.ok(acid.pH < 8.3 && acid.alkalinity < 100);
  const base = carbonateBalance(source, full, additions('lime', 0.05));
  assert.ok(base.pH > 8.3 && base.alkalinity > 100);
  const dilute = carbonateBalance(source, { batchL: 1, sourceL: 0.25 }, []);
  near(dilute.alkalinity, 25);
  assert.ok(dilute.assumed && dilute.pH > 7 && dilute.pH < 8.3);
  const missing = carbonateBalance({ pH: null, Alk: null }, full, []);
  assert.deepEqual(missing.missing, ['source pH', 'source alkalinity']);
  assert.equal(missing.pH, null);
  const complete = carbonateBalance({ pH: null, Alk: null }, { batchL: 1, sourceL: 0 }, []);
  near(complete.alkalinity, 0);
  near(complete.pH, 7);
  assert.ok(carbonateBalance({ pH: 7, Alk: 0 }, full, additions('citric', 0.01)).pH < 5);
});

test('retains modeled alkalinity when the pH measurement is missing', () => {
  const result = carbonateBalance({ pH: null, Alk: 100 }, full, additions('nahco3', 0.1));
  assert.equal(result.pH, null);
  assert.ok(result.alkalinity > 100);
});
