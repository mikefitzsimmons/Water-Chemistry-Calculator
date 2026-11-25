import { expect, test } from '@playwright/test';

test('matches a report by name, distinguishes zeros and groups the alkalinity basis', async ({ page }) => {
  await page.goto('/');
  await page.locator('#sourceSelect').selectOption({ label: 'Water report' });
  await expect(page.locator('#sec-start')).toContainText('1 ppm ≈ 1 mg/L');
  const alkalinity = page.getByRole('group', { name: 'Alkalinity', exact: true });
  const value = alkalinity.getByRole('spinbutton', { name: 'Value (mg/L)' });
  const basis = alkalinity.getByLabel('Alkalinity reporting basis');
  await expect(alkalinity).toHaveAccessibleDescription(/Total hardness.*leave calcium and alkalinity blank/);
  await expect(value).toHaveValue('');
  await expect(page.locator('#start-Ca')).toHaveValue('');

  const chloride = page.getByRole('spinbutton', { name: 'Chloride (Cl⁻) (mg/L)', exact: true });
  const sulfate = page.getByRole('spinbutton', { name: 'Sulfate (SO₄²⁻) (mg/L)', exact: true });
  await chloride.fill('0');
  await chloride.press('Tab');
  await sulfate.fill('25');
  await sulfate.press('Tab');
  await expect(chloride).toHaveValue('0');
  await expect(page.locator('#finalRows')).toContainText('Sulfate (SO₄²⁻)');
  await expect(page.locator('#finalRows')).toContainText('Chloride (Cl⁻)');

  await basis.selectOption('HCO3');
  await value.fill('122');
  await value.press('Tab');
  await basis.selectOption('CaCO3');
  await expect(value).toHaveValue('100');
  await page.reload();
  await expect(value).toHaveValue('100');
  await expect(chloride).toHaveValue('0');
  await expect(page.locator('#start-Ca')).toHaveValue('');
});

test('labels the disinfectant compound using its formula and common name', async ({ page }) => {
  await page.goto('/');
  await page.locator('#disinfectant summary').click();
  const kind = page.locator('#chlorType');
  const basis = page.locator('#chlorBasis');
  await kind.selectOption('chlorine');
  await expect(basis.locator('option[value="compound"]')).toHaveText('As HOCl (hypochlorous acid)');
  await kind.selectOption('chloramine');
  await expect(basis.locator('option[value="compound"]')).toHaveText('As NH₂Cl (chloramine)');
  await expect(basis.locator('option[value="Cl2"]')).toHaveText('As Cl₂ (chlorine equivalent)');
});
