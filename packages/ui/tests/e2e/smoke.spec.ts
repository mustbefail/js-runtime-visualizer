import { test, expect } from '@playwright/test';

test('type code → click Run → canvas shows nodes; step counter advances', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto('/');

  // Wait for the editor to mount (lazy-loaded chunk).
  await page.waitForSelector('.cm-content', { timeout: 15_000 });

  // Replace editor contents.
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('let x = 5; console.log(x);');

  await page.getByRole('button', { name: 'Run' }).click();

  // Step counter is visible and shows "1 / N" (we land on step 0 = first event).
  const snapshotPane = page.locator('.snapshot');
  await expect(snapshotPane).toContainText(/step 1 \/ \d+/);

  // The canvas SVG is rendered.
  const svg = snapshotPane.locator('svg');
  await expect(svg).toBeVisible();

  // After advancing to the last step via ⏭, the heap contains an obj for console
  // and the global frame mentions the user binding.
  await page.getByRole('button', { name: '⏭' }).click();
  // Frame node text contains "x: 5" — user binding.
  await expect(snapshotPane).toContainText(/x:\s*5/);
  // Console pane shows the logged value.
  await expect(page.locator('.console')).toContainText('5');
});

test('drag a frame → reload → position persisted', async ({ page }) => {
  // Clear localStorage on first load only — NOT on the reload (which must see
  // the persisted position). We navigate first, then clear via evaluate.
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  // Re-navigate so the app starts fresh with an empty store.
  await page.goto('/');

  await page.waitForSelector('.cm-content', { timeout: 15_000 });
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('let a = 1;');
  await page.getByRole('button', { name: 'Run' }).click();

  // Locate the global frame's drag header via stable test-ids.
  const frameNode = page.locator('[data-testid="frame-node"][data-frame-id="frame-0"]');
  await expect(frameNode).toBeVisible();
  const headerRect = frameNode.locator('[data-testid="frame-header"]');
  await expect(headerRect).toBeVisible();

  const initialBox = await headerRect.boundingBox();
  if (!initialBox) throw new Error('Could not measure initial frame position');

  // Drag the header by (+200, +50).
  await page.mouse.move(initialBox.x + 20, initialBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(initialBox.x + 220, initialBox.y + 60, { steps: 10 });
  await page.mouse.up();

  // Read localStorage to confirm the position was persisted.
  const stored = await page.evaluate(() => window.localStorage.getItem('jsrv:nodePositions'));
  expect(stored).toBeTruthy();
  expect(stored).toContain('"frame-0"');

  // Reload — position should restore.
  await page.reload();
  await page.waitForSelector('.cm-content', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Run' }).click();

  const reloadBox = await page
    .locator('[data-testid="frame-node"][data-frame-id="frame-0"]')
    .locator('[data-testid="frame-header"]')
    .boundingBox();
  if (!reloadBox) throw new Error('Could not measure reloaded frame position');

  // Allow up to 15px tolerance for sub-pixel rendering / measurement variance.
  expect(Math.abs(reloadBox.x - (initialBox.x + 200))).toBeLessThan(15);
});
