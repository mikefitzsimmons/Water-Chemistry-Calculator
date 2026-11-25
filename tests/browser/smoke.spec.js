import { expect, test } from '@playwright/test';
import { seedLegacy } from '../fixtures/legacy.js';

test('loads the calculator and restores a batch over HTTP', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Starting Water' })).toBeVisible();
  await page.locator('#openDrawerBtn').click();
  await expect(page.getByRole('heading', { name: 'Ingredient Drawer' })).toBeVisible();
  await page.locator('#doneDrawerBtn').click();
  await page.locator('#batchInput').fill('7');
  await page.locator('#batchInput').press('Tab');
  await page.reload();
  await expect(page.locator('#batchInput')).toHaveValue('7');
});

test('loads a prototype save in an independent context', async ({ context, page, baseURL }) => {
  await seedLegacy(context, baseURL);
  await page.goto('/');
  await expect(page.locator('#startNameTag')).toHaveText('Home tap');
  await expect(page.locator('#presetSel option:checked')).toContainText('House ale');
  await expect(page.locator('[data-amt="gypsum"]')).toHaveValue('6');
});
