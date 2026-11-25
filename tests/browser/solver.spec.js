import { expect, test } from '@playwright/test';

test('runs a realistic solve off the UI thread and discards stale results', async ({ page }) => {
  await page.goto('/');
  let requestStarted;
  const started = new Promise(resolve => { requestStarted = resolve; });
  let releaseRequest;
  const release = new Promise(resolve => { releaseRequest = resolve; });
  await page.route('**/solver-worker.js', async route => {
    requestStarted();
    await release;
    await route.continue();
  }, { times: 1 });
  await page.locator('#solveBtn').click();
  await started;
  await expect(page.locator('#solveStatus')).toContainText('Calculating');
  await page.locator('#unitL').click();
  await expect(page.locator('#unitL')).toHaveAttribute('aria-pressed', 'true');
  releaseRequest();
  await expect(page.locator('#solveStatus')).toContainText('Inputs changed');
  await expect(page.locator('[data-amt="gypsum"]')).toHaveValue('0');
  await page.locator('#solveBtn').click();
  await expect(page.locator('#solveStatus')).toHaveText('Additions calculated.');
  await expect(page.locator('#finalRows .frow').filter({ hasText: 'Sulfate' })).toContainText('in range');
  await expect(page.locator('#finalNotes')).toContainText('search limit');
});
