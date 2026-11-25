import { expect, test } from '@playwright/test';
import { seedLegacy } from '../fixtures/legacy.js';

test('lowering stock preserves the recipe, while edits and Calculate obey measurable caps', async ({ page }) => {
  await page.goto('/');
  const gypsum = page.locator('[data-amt="gypsum"]');
  const slider = page.locator('[data-slider="gypsum"]');
  const setDose = async value => { await gypsum.fill(value); await gypsum.press('Tab'); };
  await setDose('6');
  const max = await slider.getAttribute('max');
  const original = await page.locator('#finalRows').innerText();
  const setStock = async value => {
    await page.locator('#openDrawerBtn').click();
    await page.locator('[data-d-unlim="gypsum"]').setChecked(false);
    const field = page.locator('[data-d-stock="gypsum"]');
    await field.fill(value);
    await field.press('Tab');
    await page.keyboard.press('Escape');
  };
  await setStock('4');
  await expect(page.locator('#openDrawerBtn')).toBeFocused();
  await expect(gypsum).toHaveValue('6');
  expect(await page.locator('#finalRows').innerText()).toBe(original);
  await expect(page.locator('#finalNotes')).toContainText('2 g');
  await expect(slider).toHaveAttribute('max', max);
  expect(await slider.evaluate(node => node.style.background)).toContain('repeating-linear-gradient');
  await setStock('8');
  await expect(page.locator('#finalNotes')).not.toContainText('Shopping list');
  await setStock('4');
  await page.locator('[data-enable="gypsum"]').uncheck();
  await expect(page.locator('#finalNotes')).not.toContainText('Shopping list');
  await page.locator('[data-enable="gypsum"]').check();
  await page.locator('#solveBtn').click();
  await expect(page.locator('#solveStatus')).toHaveText('Additions calculated.');
  expect(Number(await gypsum.inputValue())).toBeLessThanOrEqual(4);
  await setStock('0.25');
  await setDose('6');
  await expect(gypsum).toHaveValue('0.2');
});

test('distilled stock changes hatching without moving the slider maximum', async ({ page, context, baseURL }) => {
  await seedLegacy(context, baseURL);
  await page.goto('/');
  const slider = page.locator('[data-slider="distilled"]');
  const max = await slider.getAttribute('max');
  const previous = await slider.getAttribute('style');
  await page.locator('#openDrawerBtn').click();
  await page.locator('[data-d-stock="distilled"]').fill('0.5');
  await page.locator('[data-d-stock="distilled"]').press('Tab');
  await page.locator('#doneDrawerBtn').click();
  await expect(slider).toHaveAttribute('max', max);
  expect(await slider.getAttribute('style')).not.toBe(previous);
  await expect(page.locator('#finalNotes')).toContainText('0.5 gal');
  await page.locator('#openDrawerBtn').click();
  await page.locator('#deselectAll').click();
  await page.locator('#doneDrawerBtn').click();
  await expect(page.locator('#drawerCount')).toHaveText('0');
  await expect(page.locator('[data-amt="gypsum"]')).toHaveValue('6');
});
