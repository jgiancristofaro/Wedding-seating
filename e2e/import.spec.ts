import { expect, test } from '@playwright/test';
import { newPlan } from './helpers';

const CSV = `\uFEFFGuest Name,Party Size,Side,Group,Dietary,RSVP,Notes
"Smith, Jane",2,Bride,Family,Vegetarian,Yes,"Front, please"
Michael Chen,1,Groom,College,Gluten free,Yes,
Priya Patel,1,Bride,Work,"Vegan, nut allergy",maybe,
Michael Chen,1,Groom,College,,Yes,duplicate row
`;

test('import a CSV with mapping, preview and duplicate detection', async ({ page }) => {
  await newPlan(page);
  await page.getByTestId('tab-guests').click();
  await page.getByTestId('import-open').first().click();
  await page
    .getByTestId('import-file')
    .setInputFiles({ name: 'guests.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  // mapping step: auto-detected columns
  await expect(page.getByLabel('Field for column Guest Name')).toHaveValue('fullName');
  await expect(page.getByLabel('Field for column Dietary')).toHaveValue('dietary');
  await page.getByTestId('import-next').click();
  const review = page.getByTestId('import-review');
  await expect(review).toContainText('4 new');
  await expect(review).toContainText('1 duplicates skipped');
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('guest-row')).toHaveCount(4);
  await expect(page.getByTestId('guest-counts')).toContainText('4 total');
  await expect(page.getByText('Guest of Jane Smith')).toBeVisible();

  // re-import merges instead of duplicating
  await page.getByTestId('import-open').first().click();
  await page.getByTestId('import-file').setInputFiles({
    name: 'guests.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(CSV.replace('Gluten free', 'Vegan')),
  });
  await page.getByTestId('import-next').click();
  await expect(page.getByTestId('import-review')).toContainText('0 new');
  await expect(page.getByTestId('import-review')).toContainText('1 changed');
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('guest-row')).toHaveCount(4);
});

test('rejects a file with no rows with a friendly message', async ({ page }) => {
  await newPlan(page);
  await page.getByTestId('tab-guests').click();
  await page.getByTestId('import-open').first().click();
  await page
    .getByTestId('import-file')
    .setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('\n\n') });
  await expect(page.getByRole('alert')).toContainText('couldn’t find any rows');
});

const ZOLA = `Total Definitely Invited,Total Maybe Invited,Title,First Name,Last Name,Suffix,Partner Title,Partner First Name,Partner Last Name,Partner Suffix,Relationship To Couple,Email Address,Phone Number,Street Address,Street Address (line 2),City,State / Region,Zip / Postal Code,Country,Child 1 First Name,Child 1 Last Name
2,,Mrs.,Marie,Curie,,Mr.,Pierre,Curie,,Bride's Family,m@example.com,,1 Rue,,Paris,NY,10003,,,
2,,,Rosalind,Franklin,,,Guest,,,Unknown,r@example.com,,,,,,,,,
3,,Mr.,Carl,Sagan,,Ms.,Ann,Druyan,,Groom's Family,c@example.com,,,,Ithaca,NY,14850,,Sasha,Sagan
`;

test('imports a Zola export with partners, unnamed guests and children as households', async ({ page }) => {
  await newPlan(page);
  await page.getByTestId('tab-guests').click();
  await page.getByTestId('import-open').first().click();
  await page
    .getByTestId('import-file')
    .setInputFiles({ name: 'export.csv', mimeType: 'text/csv', buffer: Buffer.from(ZOLA) });
  await expect(page.getByTestId('zola-note')).toBeVisible();
  await expect(page.getByLabel('Field for column Partner First Name')).toHaveValue('partnerFirst');
  await expect(page.getByLabel('Field for column Partner Title')).toHaveValue('ignore');
  await page.getByTestId('import-next').click();
  await expect(page.getByTestId('import-review')).toContainText('7 new');
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('guest-row')).toHaveCount(7);
  for (const n of ['Pierre Curie', 'Guest of Rosalind Franklin', 'Ann Druyan', 'Sasha Sagan'])
    await expect(page.getByText(n, { exact: true })).toBeVisible();
  // Sasha is flagged as a child, and the family is one household
  await expect(page.getByTestId('guest-row').filter({ hasText: 'Sasha Sagan' })).toContainText('child');
  await expect(page.getByTestId('guest-counts')).toContainText('7 total');
});
