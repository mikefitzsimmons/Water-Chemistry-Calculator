import { expect, test } from '@playwright/test';

test('switches sources, converts alkalinity and restores named profiles and pH ranges', async ({ page }) => {
  await page.goto('/');
  const source = page.locator('#sourceSelect');
  const dilution = page.locator('[data-amt="distilled"]');
  await expect(source).toHaveValue('distilled');
  await expect(dilution).toHaveCount(0);
  await source.selectOption('ro');
  await expect(dilution).toBeVisible();
  await expect(page.locator('#sourceInfo')).toContainText('estimates');
  await source.selectOption('spring');
  await expect(page.locator('#start-Ca')).toHaveValue('67');
  await expect(page.locator('#start-Alk')).toHaveValue('190');
  await page.locator('#alkBasis').selectOption('HCO3');
  await expect(page.locator('#start-Alk')).toHaveValue('231.8');
  await page.locator('#start-Alk').fill('122');
  await page.locator('#start-Alk').press('Tab');
  await page.locator('#saveStartName').fill('House spring');
  await page.locator('#saveStartBtn').click();
  await source.selectOption('distilled');
  await page.getByRole('button', { name: 'House spring', exact: true }).click();
  await expect(page.locator('#start-Alk')).toHaveValue('122');

  await page.locator('#presetSel').selectOption('burton');
  await expect(page.locator('#presetInfo')).toContainText('Allsopp');
  await page.locator('#pHTargetEnabled').check();
  const preferred = page.getByRole('spinbutton', { name: 'pH target preferred' });
  await preferred.fill('6.25');
  await preferred.press('Tab');
  await page.locator('#customTargets summary').click();
  await page.locator('#savePresetName').fill('My Burton');
  await page.locator('#savePresetNote').fill('With a pH goal');
  await page.locator('#savePresetBtn').click();
  await page.locator('#presetSel').selectOption('ipa');
  await page.reload();
  await expect(page.locator('#startNameTag')).toHaveText('House spring');
  const saved = page.locator('#presetSel option').filter({ hasText: 'My Burton' });
  await page.locator('#presetSel').selectOption(await saved.getAttribute('value'));
  await expect(preferred).toHaveValue('6.25');
  await expect(page.locator('#presetInfo')).toContainText('With a pH goal');
});

test('rejects invalid water values and target ranges and follows the treated volume', async ({ page }) => {
  await page.goto('/');
  const batch = page.locator('#batchInput');
  await batch.fill('-2');
  await batch.press('Tab');
  await expect(batch).toHaveValue('5');
  await page.locator('#sourceSelect').selectOption('custom');
  const calcium = page.locator('#start-Ca');
  await calcium.fill('-10');
  await calcium.press('Tab');
  await expect(calcium).toHaveValue('');
  await expect(page.locator('#finalRows .frow').filter({ hasText: 'Calcium' })).toContainText('unevaluated');
  const min = page.getByRole('spinbutton', { name: 'Calcium target minimum' });
  await min.fill('999');
  await min.press('Tab');
  await expect(min).toHaveValue('50');
  await page.locator('#unitL').click();
  await batch.fill('10');
  await batch.press('Tab');
  await expect(page.locator('#startAmt')).toContainText('10 L');
  const distilled = page.locator('[data-amt="distilled"]');
  await distilled.fill('2');
  await distilled.press('Tab');
  await expect(page.locator('#startAmt')).toContainText('8 L');
});

test('fits a phone viewport and completes a clean recipe workflow', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto('/');
    const sections = await page.locator('main section > header h2').allTextContents();
    expect(sections).toEqual(['Starting Water', 'Additions', 'Treated Water']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.locator('#presetSel').selectOption('pilsner');
    await page.locator('#solveBtn').tap();
    await expect(page.locator('#solveStatus')).toHaveText('Additions calculated.');
    await expect(page.locator('#finalRows')).toContainText('in range');
    await page.locator('#openDrawerBtn').tap();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('#doneDrawerBtn').tap();
    await expect(page.locator('#openDrawerBtn')).toBeFocused();
    await page.reload();
    await expect(page.locator('#presetSel')).toHaveValue('pilsner');
  } finally {
    await context.close();
  }
});
