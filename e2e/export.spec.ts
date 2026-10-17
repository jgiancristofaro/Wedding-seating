import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { newPlan } from './helpers';

async function download(page: Page, testId: string) {
  const [d] = await Promise.all([
    page.waitForEvent('download', { timeout: 30_000 }),
    page.getByTestId(testId).click(),
  ]);
  const path = await d.path();
  return { name: d.suggestedFilename(), bytes: readFileSync(path!) };
}

test('exports produce real files', async ({ page }) => {
  await newPlan(page, true);
  await page.getByTestId('tab-export').click();
  const pdf = await download(page, 'export-pdf');
  expect(pdf.name).toMatch(/seating-chart\.pdf$/);
  expect(pdf.bytes.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.bytes.length).toBeGreaterThan(20_000);

  const csv = await download(page, 'export-csv');
  const text = csv.bytes.toString('utf8');
  expect(text).toContain('First name,Last name');
  expect(text).toContain('Sophie,Bennett');
  expect(text.split('\n').length).toBeGreaterThan(100);

  const xlsx = await download(page, 'export-xlsx');
  expect(xlsx.bytes.subarray(0, 2).toString()).toBe('PK');

  const png = await download(page, 'export-png');
  expect(png.bytes.subarray(1, 4).toString()).toBe('PNG');

  const svg = await download(page, 'export-svg');
  expect(svg.bytes.toString()).toContain('<svg');

  const json = await download(page, 'export-json');
  const backup = JSON.parse(json.bytes.toString());
  expect(Object.keys(backup.doc.guests)).toHaveLength(120);

  const cards = await download(page, 'export-placecards');
  expect(cards.bytes.subarray(0, 4).toString()).toBe('%PDF');
  const roster = await download(page, 'export-roster');
  expect(roster.bytes.toString()).toContain('Head table');
});
