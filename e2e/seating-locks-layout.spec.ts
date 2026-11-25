import { expect, test, type Page } from '@playwright/test';
import { center, dragTo, newPlan, seat } from './helpers';

// Seating mode must never move, reshape or delete tables/fixtures — only guests move. Layout mode keeps all of it.
const table = (page: Page, name: string) => page.locator(`g[data-kind="table"][aria-label^="${name},"]`);
const tableBody = (page: Page, name: string) => table(page, name).locator('.table-body');
const pos = (page: Page, name: string) => table(page, name).getAttribute('transform');

test.beforeEach(async ({ page }) => {
  await newPlan(page, true);
  await expect(page.getByTestId('tab-seating')).toHaveAttribute('aria-selected', 'true');
});

test('dragging a table (or an empty chair) in Seating mode pans instead of moving it', async ({ page }) => {
  const before = await pos(page, 'Table 1');
  const screenBefore = await center(tableBody(page, 'Table 2'));
  const start = await center(tableBody(page, 'Table 1'));
  await dragTo(page, start, { x: start.x + 150, y: start.y + 80 });
  expect(await pos(page, 'Table 1')).toBe(before); // not moved in the plan
  const screenAfter = await center(tableBody(page, 'Table 2'));
  expect(Math.abs(screenAfter.x - screenBefore.x)).toBeGreaterThan(50); // the view panned

  const chair = seat(page, 'Table 3', 0);
  await expect(chair).toHaveAttribute('aria-label', /empty/);
  const before3 = await pos(page, 'Table 3');
  const c = await center(chair.locator('circle.chair'));
  await dragTo(page, c, { x: c.x - 120, y: c.y + 60 });
  expect(await pos(page, 'Table 3')).toBe(before3);
});

test('a selected table in Seating mode has no handles, layout keys or layout controls', async ({ page }) => {
  await tableBody(page, 'Table 4').click({ force: true });
  await expect(page.getByTestId('layout-hint')).toBeVisible();
  await expect(page.getByTestId('capacity')).toBeVisible(); // seat count still editable
  await expect(page.getByTestId('table-name')).toBeVisible();
  await expect(page.locator('[data-handle]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Duplicate' })).toHaveCount(0);
  await expect(page.getByText('Shape', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Rotation', { exact: true })).toHaveCount(0);

  const before = await pos(page, 'Table 4');
  const count = await page.locator('g[data-kind="table"]').count();
  await table(page, 'Table 4').focus();
  for (const k of ['ArrowRight', 'ArrowDown', 'r', 'Control+d', 'Delete', 'Backspace'])
    await page.keyboard.press(k);
  expect(await pos(page, 'Table 4')).toBe(before);
  await expect(page.locator('g[data-kind="table"]')).toHaveCount(count);
  await expect(page.getByRole('button', { name: /^Table$/ })).toHaveCount(0); // "+ Table" removed
});

test('shift-click and shift-drag do not multi-select tables in Seating mode', async ({ page }) => {
  await tableBody(page, 'Table 5').click({ force: true });
  await tableBody(page, 'Table 6').click({ force: true, modifiers: ['Shift'] });
  await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  const b = await page.getByTestId('canvas').boundingBox();
  await page.keyboard.down('Shift');
  await dragTo(page, { x: b!.x + 40, y: b!.y + b!.height - 40 }, { x: b!.x + b!.width - 40, y: b!.y + 120 });
  await page.keyboard.up('Shift');
  await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
});

test('guests still drag onto seats in Seating mode', async ({ page }) => {
  const guest = page.getByTestId('sidebar-guest').first();
  const id = await guest.getAttribute('data-guest-id');
  const before = await pos(page, 'Table 7');
  const target = seat(page, 'Table 7', 2);
  await dragTo(page, await center(guest), await center(target.locator('circle.chair')));
  await expect(target).toHaveAttribute('data-guest', id!);
  expect(await pos(page, 'Table 7')).toBe(before);
});

test('Layout mode still moves tables and shows handles', async ({ page }) => {
  await page.getByTestId('tab-layout').click();
  const before = await pos(page, 'Table 1');
  const start = await center(tableBody(page, 'Table 1'));
  await dragTo(page, start, { x: start.x + 120, y: start.y + 60 });
  expect(await pos(page, 'Table 1')).not.toBe(before);
  await expect(page.locator('[data-handle="rotate"]')).toHaveCount(1);
});
