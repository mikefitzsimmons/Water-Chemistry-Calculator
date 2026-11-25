import { expect, test } from '@playwright/test';
import { seedLegacy } from '../fixtures/legacy.js';

test('automatic treatment tracks source volume and shows required and available doses', async ({ page, context, baseURL }) => {
  await seedLegacy(context, baseURL);
  await page.goto('/');
  const treatment = page.locator('[data-treatment]');
  await expect(treatment).toContainText('4 gal of source water');
  await expect(treatment).toContainText('48 mg');
  await page.locator('[data-enable="distilled"]').uncheck();
  await expect(treatment).toContainText('60 mg');
  await page.locator('#openDrawerBtn').click();
  const stock = page.locator('[data-d-stock="kmeta"]');
  await expect(stock).toHaveValue('250');
  await stock.fill('11.5');
  await stock.press('Tab');
  await page.locator('#doneDrawerBtn').click();
  await expect(treatment).toContainText('includes 11 mg');
  await expect(treatment).toContainText('Required 60 mg');
  await expect(page.locator('#finalNotes')).toContainText('48.5 mg');
  await page.locator('[data-dechlor-mode]').selectOption('campden');
  await expect(treatment).toContainText('potassium metabisulfite per tablet');
});
