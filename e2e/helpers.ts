import { expect, type Page } from '@playwright/test';

export async function newPlan(page: Page, demo = false) {
  await page.goto('/');
  await page.getByTestId(demo ? 'load-demo' : 'create-plan').click();
  await page.waitForURL(/#\/e\/[0-9a-f]{48}$/);
  await expect(page.getByTestId('save-status')).toBeVisible();
}

export function seat(page: Page, tableName: string, index: number) {
  return page.locator(`g[data-kind="table"][aria-label^="${tableName},"] g[data-seat="${index}"]`);
}

export async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

export async function center(locator: ReturnType<Page['locator']>) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('not visible');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export async function zoomToTable(page: Page, tableName: string) {
  // focus the table via the inspector-free route: click its label area, then zoom in with keyboard
  const t = page.locator(`g[data-kind="table"][aria-label^="${tableName},"]`);
  await expect(t).toBeVisible();
  return t;
}
