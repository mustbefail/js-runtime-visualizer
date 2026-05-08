import { test, expect } from '@playwright/test';

test('type code → click Run → snapshot pane shows the global frame', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');

  // Wait for the editor to mount.
  await page.waitForSelector('.cm-content');

  // Replace editor contents — focus, select-all via keyboard, then type.
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('let x = 1 + 2; let y = x * 4;');

  // Run.
  await page.getByRole('button', { name: 'Run' }).click();

  // Snapshot pane reports a step count > 0.
  const snapshotPane = page.locator('.snapshot');
  await expect(snapshotPane).toContainText(/step \d+ \/ \d+/);

  // Call stack contains the global frame.
  await expect(snapshotPane).toContainText('<global>');

  // Console pane is reachable (may be empty for this snippet).
  await expect(page.locator('.console')).toBeVisible();
});
