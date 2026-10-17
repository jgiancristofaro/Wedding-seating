import { expect, test } from '@playwright/test';
import { center, dragTo, newPlan, seat } from './helpers';

test.beforeEach(async ({ page }) => {
  await newPlan(page, true);
  await expect(page.getByTestId('tab-seating')).toHaveAttribute('aria-selected', 'true');
});

test('drag a guest from the list onto a specific seat', async ({ page }) => {
  const guest = page.getByTestId('sidebar-guest').first();
  const id = await guest.getAttribute('data-guest-id');
  const target = seat(page, 'Table 1', 3);
  await dragTo(page, await center(guest), await center(target));
  await expect(target).toHaveAttribute('data-guest', id!);
  await expect(page.getByTestId('seat-counts')).toContainText('11 seated');
});

test('tap a guest, then tap a seat (no-drag alternative)', async ({ page }) => {
  const guest = page.getByTestId('sidebar-guest').first();
  const id = await guest.getAttribute('data-guest-id');
  await guest.click();
  await expect(page.getByTestId('armed-banner')).toBeVisible();
  await seat(page, 'Table 2', 0).click();
  await expect(seat(page, 'Table 2', 0)).toHaveAttribute('data-guest', id!);
  await expect(page.getByTestId('armed-banner')).toBeHidden();
});

test('keyboard: pick up a guest with Enter and seat them with Enter', async ({ page }) => {
  const guest = page.getByTestId('sidebar-guest').first();
  const id = await guest.getAttribute('data-guest-id');
  await guest.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('armed-banner')).toBeVisible();
  const table = page.locator('g[data-kind="table"][aria-label^="Table 4,"]');
  await table.focus();
  await page.keyboard.press('Enter');
  await expect(table.locator(`g[data-guest="${id}"]`)).toHaveCount(1);
});

test('a broken "must not sit together" rule shows as a conflict', async ({ page }) => {
  await expect(page.getByTestId('conflicts-btn')).toContainText('No conflicts');
  await page.getByTestId('sidebar-search').fill('Frank Bennett');
  await page.getByTestId('sidebar-guest').first().click();
  await seat(page, 'Table 5', 0).click();
  await page.getByTestId('sidebar-search').fill('Linda Bennett');
  await page.getByTestId('sidebar-guest').first().click();
  await seat(page, 'Table 5', 1).click();
  await expect(page.getByTestId('conflicts-btn')).toContainText('1 conflict');
  await page.getByTestId('conflicts-btn').click();
  await expect(page.getByTestId('conflicts-panel')).toContainText(
    'Frank Bennett and Linda Bennett must not sit near each other',
  );
  await expect(
    page.locator('g[data-kind="table"][aria-label^="Table 5,"] g[aria-label*="has a conflict"]'),
  ).toHaveCount(2);
  // undo fixes it
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('conflicts-btn')).toContainText('No conflicts');
});

test('auto-seat produces a preview that can be accepted', async ({ page }) => {
  await page.getByTestId('autoseat-open').click();
  await page.getByTestId('autoseat-run').click();
  await expect(page.getByTestId('preview-banner')).toBeVisible({ timeout: 30_000 });
  const score = Number(await page.getByTestId('preview-score').textContent());
  expect(score).toBeGreaterThan(60);
  await page.getByTestId('preview-accept').click();
  await expect(page.getByTestId('seat-counts')).toContainText('0 to seat');
  await expect(page.getByTestId('conflicts-btn')).toContainText('No conflicts');
});

test('view-only link cannot edit', async ({ page, context }) => {
  await page.getByTestId('share-btn').click();
  const viewUrl = await page.getByTestId('view-link').inputValue();
  const viewer = await context.newPage();
  await viewer.goto(viewUrl);
  await expect(viewer.getByTestId('save-status')).toHaveAttribute('data-status', 'readonly');
  await expect(viewer.getByTestId('tab-guests')).toHaveCount(0);
  await expect(viewer.getByTestId('autoseat-open')).toHaveCount(0);
  await viewer.getByTestId('sidebar-search').fill('Sophie');
  await viewer.getByTestId('sidebar-guest').first().click();
  await expect(viewer.getByTestId('guest-seat-info')).toContainText('Head table');
});
