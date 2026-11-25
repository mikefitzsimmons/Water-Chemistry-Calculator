import { expect, test } from '@playwright/test';
import { legacy, seedLegacy } from '../fixtures/legacy.js';

test('migrates, reloads and transfers a recipe with a backup', async ({ browser, context, page, baseURL }) => {
  await seedLegacy(context, baseURL);
  await page.goto('/');
  await expect(page.locator('#saveStatus')).toContainText('migrated');
  await page.reload();
  await expect(page.locator('#presetSel option:checked')).toContainText('House ale');
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()
  ]);
  const second = await browser.newContext({ baseURL });
  try {
    const imported = await second.newPage();
    await imported.goto('/');
    await imported.locator('#backupInput').setInputFiles(await download.path());
    await expect(imported.locator('#startNameTag')).toHaveText('Home tap');
    await expect(imported.locator('[data-amt="gypsum"]')).toHaveValue('6');
    await imported.locator('#backupInput').setInputFiles({
      name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{')
    });
    await expect(imported.locator('#toast')).toContainText('Import failed');
    await expect(imported.locator('[data-amt="gypsum"]')).toHaveValue('6');
  } finally {
    await second.close();
  }
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wcStaticV1')))).toEqual(legacy);
});

test('blocked storage leaves the calculator usable in memory', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await page.goto('/');
  await expect(page.locator('#saveStatus')).toContainText('unavailable');
  await page.locator('#batchInput').fill('8');
  await page.locator('#batchInput').press('Tab');
  await expect(page.locator('#startAmt')).toContainText('8 gal');
  await expect(page.locator('#saveStatus')).toContainText('unavailable');
});
