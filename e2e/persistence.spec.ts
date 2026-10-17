import { expect, test } from '@playwright/test';
import { newPlan } from './helpers';

test('autosaves and restores after reload; recent plans list', async ({ page }) => {
  await newPlan(page);
  await page.getByTestId('tab-guests').click();
  await page.getByText('Add one by one').click();
  await page.getByLabel('First name').fill('Persisted');
  await page.getByLabel('Last name').fill('Guest');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
  const url = page.url();
  await page.reload();
  await page.getByTestId('tab-guests').click();
  await expect(page.getByText('Persisted Guest')).toBeVisible();
  // the home page remembers the plan
  await page.goto('/');
  await expect(page.getByText('Your recent plans')).toBeVisible();
  await page
    .getByRole('button', { name: /Our wedding/ })
    .first()
    .click();
  await expect(page).toHaveURL(url);
});

test('two tabs editing the same plan merge their changes', async ({ page, context }) => {
  await newPlan(page);
  const url = page.url();
  const other = await context.newPage();
  await other.goto(url);
  await page.getByTestId('tab-guests').click();
  await other.getByTestId('tab-guests').click();
  await page.getByText('Add one by one').click();
  await page.getByLabel('First name').fill('Alpha');
  await page.getByRole('button', { name: 'Done' }).click();
  await other.getByText('Add one by one').click();
  await other.getByLabel('First name').fill('Beta');
  await other.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
  await expect(other.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
  await page.reload();
  await page.getByTestId('tab-guests').click();
  await expect(page.getByText('Alpha', { exact: true })).toBeVisible();
  await expect(page.getByText('Beta', { exact: true })).toBeVisible();
});

test('invalid link shows a friendly error', async ({ page }) => {
  await page.goto('/#/e/' + '0'.repeat(48));
  await expect(page.getByText('We couldn’t find that plan')).toBeVisible();
  await page.goto('/#/garbage');
  await expect(page.getByText('This link doesn’t work')).toBeVisible();
});
