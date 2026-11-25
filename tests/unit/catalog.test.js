import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INGREDIENTS, ingredientById } from '../../src/catalog.js';
import { evaluate } from '../../src/evaluate.js';

const near = (value, expected) => assert.ok(Math.abs(value - expected) < 0.0001, `${value} ≠ ${expected}`);

test('documented hydrates contribute the independently calculated masses', () => {
  function atOneGram(id) {
    return evaluate({
      batchL: 10, start: { Ca: 0, SO4: 0, Cl: 0 }, adds: { [id]: 1 }, enabled: { [id]: true }
    }, INGREDIENTS, ['Ca', 'SO4', 'Cl']).profile;
  }
  const gypsum = atOneGram('gypsum');
  near(gypsum.Ca, 23.2782);
  near(gypsum.SO4, 55.7937);
  near(atOneGram('cacl2-dihydrate').Ca, 27.2621);
  near(atOneGram('cacl2-anhydrous').Ca, 36.1128);
});

test('the catalog records the unit, form and source for each entry', () => {
  const expected = {
    gypsum: 'g', 'cacl2-dihydrate': 'g', 'cacl2-anhydrous': 'g', epsom: 'g', mgcl2: 'g',
    nacl: 'g', nahco3: 'g', chalk: 'g', lime: 'g', kcl: 'g', khco3: 'g', citric: 'g',
    lactic: 'mL', phosphoric: 'mL', kmeta: 'mg', campden: 'tablets', distilled: 'L'
  };
  assert.deepEqual(Object.fromEntries(INGREDIENTS.map(g => [g.id, g.unit])), expected);
  assert.ok(INGREDIENTS.every(g => g.source.startsWith('https://') && g.step > 0));
  assert.equal(ingredientById('chalk').inventoryOnly, true);
  assert.equal(ingredientById('chalk').mass, undefined);
  near(ingredientById('lactic').strength * ingredientById('lactic').density, 1.06832);
  near(ingredientById('phosphoric').strength * ingredientById('phosphoric').density, 1.43225);
});
