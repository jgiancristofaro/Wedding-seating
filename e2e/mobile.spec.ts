import { expect, test } from '@playwright/test';
import { newPlan, seat } from './helpers';

test('phone: bottom sheet, tap-to-assign, no horizontal scroll', async ({ page }) => {
  await newPlan(page, true);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
  const sheet = page.getByTestId('guest-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: /Guests/ }).click();
  const guest = page.getByTestId('sidebar-guest').first();
  const id = await guest.getAttribute('data-guest-id');
  await guest.tap();
  await expect(page.getByTestId('armed-banner')).toBeVisible();
  const target = seat(page, 'Table 1', 0);
  await target.tap();
  await expect(target).toHaveAttribute('data-guest', id!);
  // tabs are reachable on a phone
  await page.getByTestId('mtab-guests').tap();
  await expect(page.getByTestId('guest-table')).toBeVisible();
  const w2 = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w2).toBeLessThanOrEqual(375);
});
