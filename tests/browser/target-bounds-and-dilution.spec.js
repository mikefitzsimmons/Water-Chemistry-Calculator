import { expect, test } from '@playwright/test';

async function commitNumber(field, value) {
  await field.fill(value);
  await field.press('Tab');
}

test('bounds treated-water target fields and restores an oversized entry', async ({ page }) => {
  await page.goto('/');
  const fields = page.locator('#targetRows input[type="number"]');
  for (const field of await fields.all()) {
    const maximum = await field.getAttribute('max');
    expect(maximum).not.toBeNull();
    expect(Number(maximum)).toBeGreaterThan(0);
    expect(Number(maximum)).toBeLessThan(1e47);
  }

  for (const bound of ['minimum', 'maximum']) {
    const calcium = page.getByRole('spinbutton', { name: `Calcium target ${bound}` });
    const original = await calcium.inputValue();
    await calcium.fill('1e47');
    expect(await calcium.evaluate(field => field.validity.rangeOverflow)).toBe(true);
    await calcium.press('Tab');
    await expect(calcium).toHaveValue(original);
  }
});

test('warns about a sulfate target maximum above the reference value', async ({ page }) => {
  await page.goto('/');
  const sulfate = page.getByRole('spinbutton', { name: 'Sulfate target maximum' });
  const notice = page.locator('#targetAdvisories').getByText(/250\s*mg\/L/i);
  await expect(notice).toBeHidden();
  await commitNumber(sulfate, '300');
  await expect(sulfate).toHaveValue('300');
  await expect(notice).toBeVisible();
  await commitNumber(sulfate, '250');
  await expect(notice).toBeHidden();
});

test('keeps profile bars aligned when a result has wide diagnostic text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const calcium = page.locator('#finalRows .frow').filter({ hasText: 'Calcium' }).locator('.mini');
  const sulfate = page.locator('#finalRows .frow').filter({ hasText: 'Sulfate' }).locator('.mini');
  const before = await calcium.boundingBox();

  await page.locator('#sourceSelect').selectOption('custom');
  await commitNumber(page.locator('#start-Ca'), '123456789');

  const after = await calcium.boundingBox();
  const neighbor = await sulfate.boundingBox();
  expect(after.x).toBeCloseTo(before.x, 1);
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(after.x).toBeCloseTo(neighbor.x, 1);
  expect(after.width).toBeCloseTo(neighbor.width, 1);
});

test('uses gallon fractions and stops an over-stock drag at exactly five gallons', async ({ page }) => {
  await page.goto('/');
  await page.locator('#sourceSelect').selectOption('ro');
  await commitNumber(page.locator('#batchInput'), '6');
  await page.locator('#openDrawerBtn').click();
  await page.locator('[data-d-unlim="distilled"]').uncheck();
  await commitNumber(page.locator('[data-d-stock="distilled"]'), '5');
  await page.locator('#doneDrawerBtn').click();

  const slider = page.locator('[data-slider="distilled"]');
  const amount = page.locator('[data-amt="distilled"]');
  const readout = page.locator('[data-dilution-readout]');
  await expect(amount).toHaveAttribute('step', '0.0625');
  await slider.press('ArrowRight');
  await expect(amount).toHaveValue('0.0625');
  await expect(readout).toBeVisible();
  await expect(readout).toHaveText('8 fl oz');
  await commitNumber(amount, '1.0625');
  await expect(readout).toHaveText('1 gal 8 fl oz');

  await slider.scrollIntoViewIfNeeded();
  const track = await slider.boundingBox();
  const y = track.y + track.height / 2;
  await page.mouse.move(track.x + track.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.97, y);
  await page.mouse.up();
  await expect(amount).toHaveValue('5');
  await expect(readout).toContainText('5 gal');
  await expect(page.locator('#startAmt')).toContainText('1 gal of 6 gal');

  await page.locator('#unitL').click();
  expect(Number(await amount.inputValue())).toBeCloseTo(18.92705892, 6);
  await expect(amount).toHaveAttribute('step', '0.1');
  await slider.press('Home');
  await slider.press('ArrowRight');
  await expect(amount).toHaveValue('0.1');
});
