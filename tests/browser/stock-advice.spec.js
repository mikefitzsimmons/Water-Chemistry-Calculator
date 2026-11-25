import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('distilled IPA offers chloride fixes on demand and keeps Epsom salt optional', async ({ page }) => {
  await page.goto('/');
  await page.locator('#presetSel').selectOption('ipa');
  await page.locator('#openDrawerBtn').click();
  await page.locator('#deselectAll').click();
  await page.locator('[data-d-owned="gypsum"]').check();
  await page.locator('[data-d-unlim="gypsum"]').check();
  await page.locator('#doneDrawerBtn').click();
  await page.locator('#solveBtn').tap();
  await expect(page.locator('#solveStatus')).toHaveText('Additions calculated.');
  const chloride = page.locator('[data-result-key="Cl"]');
  await expect(chloride).toContainText('25 mg/L low');
  await expect(page.locator('#finalRows .frow .outrange')).toHaveCount(1);
  const disclosure = chloride.getByRole('button', { name: 'Ways to raise chloride' });
  const panel = page.locator('#stock-options-Cl');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();
  await disclosure.press('Space');
  await expect(panel).toBeVisible();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  const salt = panel.locator('li').filter({ hasText: 'Table salt' });
  await expect(salt).toContainText('Buy 1 g');
  await expect(salt).toContainText('Chloride would reach 32.05 mg/L and be in range.');
  await expect(salt).toContainText('Sodium');
  await expect(panel).toContainText('Calcium chloride dihydrate');
  await expect(panel).not.toContainText('Epsom salt');
  await disclosure.tap();
  await expect(panel).toBeHidden();
  const optional = page.locator('#optionalAdjustments');
  await expect(optional).toContainText('Epsom salt is optional.');
  await expect(optional).toContainText('Magnesium is already in range.');
  await expect(optional).not.toContainText('Table salt is optional');

  const gypsum = page.locator('[data-amt="gypsum"]');
  await gypsum.fill('6');
  await gypsum.press('Tab');
  await expect(disclosure).toHaveCount(0);
  await expect(optional).toBeHidden();
});
