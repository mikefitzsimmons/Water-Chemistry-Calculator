import { expect, test } from '@playwright/test';
import { seedLegacy } from '../fixtures/legacy.js';

test('Calculate excludes stale disabled gypsum and dilution', async ({ page, context, baseURL }) => {
  await seedLegacy(context, baseURL);
  await page.goto('/');
  await page.locator('[data-dechlor-enabled]').uncheck();
  await page.locator('[data-enable="gypsum"]').uncheck();
  await page.locator('[data-enable="epsom"]').uncheck();
  const chloride = page.locator('[data-enable="mgcl2"]');
  if (await chloride.count()) await chloride.uncheck();
  await page.locator('[data-enable="distilled"]').uncheck();
  await page.locator('#unitL').click();
  await expect(page.locator('#startAmt')).toContainText('18.927 L');
  await page.locator('#solveBtn').click();
  await expect(page.locator('#startAmt')).toContainText('18.927 L');
  await page.locator('#unitGal').click();
  await expect(page.locator('[data-amt="gypsum"]')).toHaveValue('6');
  await expect(page.locator('[data-amt="distilled"]')).toHaveValue('1');
  const sulfate = page.locator('#finalRows .frow').filter({ hasText: 'Sulfate' });
  await expect(sulfate).toContainText('25');
});
