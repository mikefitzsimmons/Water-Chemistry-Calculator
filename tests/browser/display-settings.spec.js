import { expect, test } from '@playwright/test';

async function checkContrast(page) {
  const contrast = await page.evaluate(() => {
    const palette = getComputedStyle(document.documentElement);
    function luminance(name) {
      const rgb = palette.getPropertyValue(name).trim().slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255);
      const linear = rgb.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }
    return ['--ink', '--ink2', '--green', '--bad'].map(name => {
      const colors = [luminance(name), luminance('--card')];
      return (Math.max(...colors) + 0.05) / (Math.min(...colors) + 0.05);
    });
  });
  expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);
}

test('explicit appearance overrides the system and persists', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const root = page.locator('html');
  const settings = page.getByText('Settings', { exact: true });
  const appearance = page.getByLabel('Appearance');
  await expect(root).toHaveCSS('color-scheme', 'dark');
  await settings.click();
  await appearance.selectOption('light');
  await expect(root).toHaveCSS('color-scheme', 'light');
  await checkContrast(page);
  await page.reload();
  await expect(root).toHaveCSS('color-scheme', 'light');
  await settings.click();
  await page.emulateMedia({ colorScheme: 'light' });
  await appearance.selectOption('dark');
  await expect(root).toHaveCSS('color-scheme', 'dark');
  await checkContrast(page);
  await appearance.selectOption('system');
  await expect(root).toHaveCSS('color-scheme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveCSS('color-scheme', 'dark');
});

test('drawer reference icons are opt-in and keyboard accessible', async ({ page }) => {
  await page.goto('/');
  const open = page.locator('#openDrawerBtn');
  const drawer = page.getByRole('dialog');
  const reference = drawer.getByRole('link', { name: 'Gypsum reference (opens in a new tab)' });
  await open.click();
  await expect(drawer.getByRole('link')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#doneDrawerBtn')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByText('Settings', { exact: true }).click();
  await page.getByLabel('Show ingredient references').check();
  await page.reload();
  await open.click();
  await expect(reference).toHaveAttribute('target', '_blank');
  await expect(reference.locator('svg')).toBeVisible();
  const gypsum = drawer.getByRole('checkbox', { name: 'Gypsum', exact: true });
  await gypsum.focus();
  await page.keyboard.press('Tab');
  await expect(reference).toBeFocused();
  await expect(reference).toHaveCSS('outline-width', '2px');
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
  await expect(page.locator('#presetInfo .reference-link svg')).toBeVisible();
});
