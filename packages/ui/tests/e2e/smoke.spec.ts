import { test, expect } from '@playwright/test';

test('type code → click Run → snapshots and console reflect user code', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');

  // Wait for the editor to mount.
  await page.waitForSelector('.cm-content');

  // Replace editor contents — focus, select-all via keyboard, then type.
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('let x = 5; console.log(x);');

  // Run.
  await page.getByRole('button', { name: 'Run' }).click();

  const snapshotPane = page.locator('.snapshot');

  // Snapshot pane reports a step count.
  await expect(snapshotPane).toContainText(/step \d+ \/ \d+/);

  // Call stack contains the global frame.
  await expect(snapshotPane).toContainText('<global>');

  // Total step count must be >= 2 — proves user code actually ran (not just the
  // pre-pump enter-frame snapshot for an empty Program).
  const stepText = await snapshotPane
    .locator('text=/step \\d+ \\/ \\d+/')
    .first()
    .innerText();
  const match = stepText.match(/step \d+ \/ (\d+)/);
  expect(match).not.toBeNull();
  const totalSteps = Number(match![1]);
  expect(totalSteps).toBeGreaterThanOrEqual(2);

  // Snapshot pane contains a binding from the user code (x: 5).
  await expect(snapshotPane).toContainText(/x:\s*5/);

  // Console pane reflects the console.log output.
  const consolePane = page.locator('.console');
  await expect(consolePane).toBeVisible();
  await expect(consolePane).toContainText('5');
});
