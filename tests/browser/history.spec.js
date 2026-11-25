import { expect, test } from '@playwright/test';
import { defaultState } from '../../src/data.js';
import { encodeBackup, migrateLegacy } from '../../src/storage.js';
import { legacy } from '../fixtures/legacy.js';

async function setNumber(page, selector, value) {
  const field = page.locator(selector);
  await field.fill(String(value));
  await field.press('Tab');
}

test('groups Calculate, Deselect all and stock edits and persists history outcomes', async ({ page, context }) => {
  await page.goto('/');
  const gypsum = page.locator('[data-amt="gypsum"]');
  const undo = page.locator('#undoBtn');
  const redo = page.locator('#redoBtn');
  await setNumber(page, '[data-amt="gypsum"]', 6);
  await page.locator('#openDrawerBtn').click();
  await page.locator('[data-d-unlim="gypsum"]').uncheck();
  await setNumber(page, '[data-d-stock="gypsum"]', 4);
  await page.locator('#doneDrawerBtn').click();
  const notes = page.locator('#finalNotes');
  await expect(notes).toContainText('2 g');
  await undo.click();
  await expect(notes).toContainText('6 g');
  await redo.click();
  await expect(notes).toContainText('2 g');
  await page.locator('#solveBtn').click();
  await expect(page.locator('#solveStatus')).toHaveText('Additions calculated.');
  const calculated = await gypsum.inputValue();
  expect(Number(calculated)).toBeLessThanOrEqual(4);
  await undo.click();
  await expect(gypsum).toHaveValue('6');
  await expect(notes).toContainText('2 g');
  await redo.click();
  await expect(gypsum).toHaveValue(calculated);

  const originalCount = await page.locator('#drawerCount').innerText();
  await page.locator('#openDrawerBtn').click();
  await page.locator('#deselectAll').click();
  await page.locator('#doneDrawerBtn').click();
  await expect(page.locator('#drawerCount')).toHaveText('0');
  await undo.click();
  await expect(page.locator('#drawerCount')).toHaveText(originalCount);
  await expect(redo).toBeEnabled();

  const otherTab = await context.newPage();
  await otherTab.goto('/');
  await expect(otherTab.locator('[data-amt="gypsum"]')).toHaveValue(calculated);
  await expect(otherTab.locator('#undoBtn')).toBeDisabled();
  await otherTab.close();
  await page.reload();
  await expect(gypsum).toHaveValue(calculated);
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
});

test('rapid slider drags commit separately and cancellation preserves redo', async ({ page }) => {
  await page.goto('/');
  const slider = page.locator('[data-slider="gypsum"]');
  const gypsum = page.locator('[data-amt="gypsum"]');
  await slider.scrollIntoViewIfNeeded();
  const { x, y, width, height } = await slider.boundingBox();
  const mid = y + height / 2;
  async function drag(from, to) {
    await page.mouse.move(x + width * from, mid);
    await page.mouse.down();
    await page.mouse.move(x + width * to, mid, { steps: 2 });
    await page.mouse.up();
  }
  await drag(0.10, 0.35);
  const first = await gypsum.inputValue();
  await drag(0.35, 0.60);
  const second = await gypsum.inputValue();
  expect(second).not.toBe(first);
  await page.locator('#undoBtn').click();
  await expect(gypsum).toHaveValue(first);
  await slider.scrollIntoViewIfNeeded();
  await slider.evaluate(input => {
    input.value = input.max;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
  });
  await expect(gypsum).toHaveValue(first);
  await setNumber(page, '[data-amt="gypsum"]', first);
  await expect(page.locator('#redoBtn')).toBeEnabled();
  await page.locator('#redoBtn').click();
  await expect(gypsum).toHaveValue(second);
  await page.locator('#undoBtn').click();
  await page.locator('#undoBtn').click();
  await expect(gypsum).toHaveValue('0');
});

test('history restores saved records and preserves native text undo', async ({ page }) => {
  await page.goto('/');
  const name = page.locator('#saveStartName');
  await name.fill('Tap profile');
  await page.locator('#saveStartBtn').click();
  await expect(page.locator('#startNameTag')).toHaveText('Tap profile');
  await name.pressSequentially('Draft');
  await name.press('Control+z');
  await expect(page.locator('#startNameTag')).toHaveText('Tap profile');
  await page.locator('#startNameTag').click();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#startNameTag')).toHaveText('Distilled');
  await expect(page.locator('#sourceSelect option').filter({ hasText: 'Tap profile' })).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('#startNameTag')).toHaveText('Tap profile');
  await page.locator('#customTargets summary').click();
  await page.locator('#savePresetName').fill('Saved pale');
  await page.locator('#savePresetBtn').click();
  await page.locator('#undoBtn').click();
  await expect(page.locator('#presetSel option').filter({ hasText: 'Saved pale' })).toHaveCount(0);
  await page.locator('#redoBtn').click();
  await expect(page.locator('#presetSel option:checked')).toContainText('Saved pale');
});

test('backup import is one transaction', async ({ page }) => {
  await page.goto('/');
  const backup = migrateLegacy(legacy, defaultState());
  await page.locator('#backupInput').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(encodeBackup(backup))
  });
  await expect(page.locator('#startNameTag')).toHaveText('Home tap');
  await expect(page.locator('[data-amt="gypsum"]')).toHaveValue('6');
  await page.locator('#undoBtn').click();
  await expect(page.locator('#startNameTag')).toHaveText('Distilled');
  await expect(page.locator('[data-amt="gypsum"]')).toHaveValue('0');
  await expect(page.locator('#undoBtn')).toBeDisabled();
  await page.locator('#redoBtn').click();
  await expect(page.locator('#startNameTag')).toHaveText('Home tap');
  await expect(page.locator('[data-amt="gypsum"]')).toHaveValue('6');
});
