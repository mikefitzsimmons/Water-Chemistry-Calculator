import { expect, test } from '@playwright/test';
import { seedLegacy } from '../fixtures/legacy.js';

test('pH reports missing inputs and ions remain available through full dilution', async ({ page, context, baseURL }) => {
  await seedLegacy(context, baseURL);
  await page.goto('/');
  await expect(page.locator('#finalPH')).toContainText(/\d\.\d/);
  await page.locator('#start-pH').fill('');
  await page.locator('#start-pH').press('Tab');
  await expect(page.locator('#finalPH')).toContainText('source pH');
  await expect(page.locator('#finalRows .frow').filter({ hasText: 'Calcium' })).toContainText(/\d/);
  await page.locator('#openDrawerBtn').click();
  await page.locator('[data-d-unlim="distilled"]').check();
  await page.locator('#doneDrawerBtn').click();
  await page.locator('[data-amt="gypsum"]').fill('0');
  await page.locator('[data-amt="gypsum"]').press('Tab');
  await page.locator('[data-amt="distilled"]').fill('5');
  await page.locator('[data-amt="distilled"]').press('Tab');
  await expect(page.locator('#startAmt')).toContainText('0 gal');
  await expect(page.locator('#finalPH')).toContainText('7');
});
