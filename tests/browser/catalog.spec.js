import { expect, test } from '@playwright/test';

test('calcium chloride forms have separate stock and change the calcium result', async ({ page }) => {
  await page.goto('/');
  await page.locator('#scaleStep').selectOption('0.01');
  const dihydrate = page.locator('[data-amt="cacl2-dihydrate"]');
  const calcium = page.locator('#finalRows .frow').filter({ hasText: 'Calcium' });
  await dihydrate.fill('1.00');
  await dihydrate.press('Tab');
  const before = await calcium.innerText();
  await page.locator('[data-enable="cacl2-dihydrate"]').uncheck();
  await page.locator('#openDrawerBtn').click();
  const owned = page.locator('[data-d-owned="cacl2-anhydrous"]');
  if (!await owned.isChecked()) await owned.check();
  await page.locator('#doneDrawerBtn').click();
  const anhydrous = page.locator('[data-amt="cacl2-anhydrous"]');
  await anhydrous.fill('1.00');
  await anhydrous.press('Tab');
  expect(await calcium.innerText()).not.toBe(before);
  await anhydrous.fill('0.03');
  await anhydrous.press('Tab');
  await page.reload();
  await expect(anhydrous).toHaveValue('0.03');
});
