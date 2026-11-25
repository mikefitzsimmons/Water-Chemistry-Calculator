import { expect, test } from '@playwright/test';
import { legacy, seedLegacy } from '../fixtures/legacy.js';

test('a keyboard-adjusted recipe and its calculated profile survive revisiting the origin', async ({ page }) => {
  await page.goto('/');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#presetSel').selectOption('ipa');
  await page.locator('#solveBtn').click();
  await expect(page.locator('#solveStatus')).toHaveText('Additions calculated.');
  const dose = page.locator('[data-amt="gypsum"]');
  const original = Number(await dose.inputValue());
  const slider = page.locator('[data-slider="gypsum"]');
  await slider.focus();
  await expect(slider).toBeFocused();
  await slider.press('ArrowRight');
  await expect(dose).toHaveValue(String(Number((original + 0.1).toFixed(1))));
  await expect(slider).toBeFocused();
  const profile = await page.locator('#finalRows').innerText();
  await page.goto('about:blank');
  await page.goto('/');
  await expect(page.locator('#presetSel')).toHaveValue('ipa');
  expect(await page.locator('#finalRows').innerText()).toBe(profile);
  expect(errors).toEqual([]);
});

test('previews over-stock dragging and clamps on release', async ({ page }) => {
  await page.goto('/');
  await page.locator('#openDrawerBtn').click();
  await page.locator('[data-d-unlim="gypsum"]').uncheck();
  const stock = page.locator('[data-d-stock="gypsum"]');
  await stock.fill('0.25');
  await stock.press('Tab');
  await page.locator('#doneDrawerBtn').click();
  const slider = page.locator('[data-slider="gypsum"]');
  await slider.scrollIntoViewIfNeeded();
  const track = await slider.boundingBox();
  await page.mouse.move(track.x + track.width * 0.8, track.y + track.height / 2);
  await page.mouse.down();
  const warning = page.locator('[data-addrow="gypsum"] [data-stock-warning]');
  await expect(warning).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('[data-amt="gypsum"]')).toHaveValue('0.2');
  await expect(warning).toBeHidden();
});

test('contains drawer focus and supports escape, backdrop and touch on a phone', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.goto('/');
    const opener = page.locator('#openDrawerBtn');
    await page.getByRole('link', { name: 'Additions', exact: true }).tap();
    await expect(page).toHaveURL(/#sec-adds$/);
    const closer = page.locator('#closeDrawerBtn');
    const done = page.locator('#doneDrawerBtn');
    await opener.tap();
    await expect(closer).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(done).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closer).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await opener.tap();
    await page.touchscreen.tap(195, 16);
    await expect(opener).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const slider = page.locator('[data-slider="gypsum"]');
    await slider.tap();
    await expect(page.locator('[data-amt="gypsum"]')).not.toHaveValue('0');
  } finally {
    await context.close();
  }
});

test('explains a stock-limited miss alongside an unevaluated pH goal', async ({ page, context, baseURL }) => {
  const sample = structuredClone(legacy);
  sample.start.pH = null;
  sample.start.chlorType = 'none';
  sample.target.Ca = { min: 0, ideal: 100, max: 200 };
  sample.drawer.gypsum.stock = 0.25;
  sample.enabled = Object.fromEntries([
    'gypsum', 'cacl2', 'epsom', 'mgcl2', 'nacl', 'nahco3', 'lime', 'kcl', 'khco3',
    'citric', 'lactic', 'phosphoric', 'distilled'
  ].map(id => [id, id === 'gypsum']));
  await seedLegacy(context, baseURL, sample);
  await page.goto('/');
  await page.locator('#pHTargetEnabled').check();
  await page.locator('#solveBtn').click();
  await expect(page.locator('#solveStatus')).toHaveText('Additions calculated.');
  await expect(page.locator('[data-amt="gypsum"]')).toHaveValue('0.2');
  await expect(page.locator('#finalNotes')).toContainText('pH target · unevaluated');
  await expect(page.locator('#finalNotes')).toContainText(/Sulfate with more stock.*low → in range/);
  await expect(page.locator('#finalNotes')).toContainText(/Buying .* g of Gypsum/);
});
