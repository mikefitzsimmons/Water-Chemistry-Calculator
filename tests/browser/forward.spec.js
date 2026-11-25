import { expect, test } from '@playwright/test';
import { legacy, seedLegacy } from '../fixtures/legacy.js';

test('an older recipe drops disabled planned doses and Calculate respects drawer selections', async ({ page, context, baseURL }) => {
  const sample = structuredClone(legacy);
  sample.enabled.gypsum = false;
  sample.enabled.distilled = false;
  await seedLegacy(context, baseURL, sample);
  await page.goto('/');
  await expect(page.locator('[data-amt="gypsum"]')).toHaveValue('0');
  await expect(page.locator('[data-amt="distilled"]')).toHaveValue('0');
  await page.locator('[data-dechlor-mode]').selectOption('skip');
  await page.locator('#openDrawerBtn').click();
  await page.locator('#deselectAll').click();
  await page.locator('#doneDrawerBtn').click();
  await page.locator('#unitL').click();
  await expect(page.locator('#startAmt')).toContainText('18.927 L');
  await page.locator('#solveBtn').click();
  await expect(page.locator('#startAmt')).toContainText('18.927 L');
  await page.locator('#unitGal').click();
  await expect(page.locator('[data-amt="gypsum"]')).toHaveCount(0);
  await expect(page.locator('[data-amt="distilled"]')).toHaveCount(0);
  const sulfate = page.locator('#finalRows .frow').filter({ hasText: 'Sulfate' });
  await expect(sulfate).toContainText('25');
});
