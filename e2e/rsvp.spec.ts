import { expect, test, type Page } from '@playwright/test';
import { newPlan } from './helpers';

// Made-up data in the shape of Zola's guest-list export and RSVP export.
const GUESTS = `Total Definitely Invited,Total Maybe Invited,Title,First Name,Last Name,Suffix,Partner Title,Partner First Name,Partner Last Name,Partner Suffix,Relationship To Couple,Email Address
2,,Mrs.,Marie,Curie,,Mr.,Pierre,Curie,,Bride's Family,m@example.com
2,,,Rosalind,Franklin,,,Guest,,,Unknown,r@example.com
1,,Mr.,Niels,Bohr,,,,,,Unknown,n@example.com
2,,,Grace,Hopper,,,Guest,,,Unknown,g@example.com
`;
const RSVPS = `Title,First Name,Last Name,Suffix,Welcome Dinner,Ceremony,Reception,Meal Choice,Food allergies or dietary restrictions?
Mrs.,Marie,Curie,,Attending,Attending,Attending,short rib,None
Mr.,Pierre,Curie,,Declined,Attending,Attending,arctic char,None
"",Rosalind,Franklin,,Attending,Attending,Attending,cavatelli,Allergic to mango
"",Guest,,,Declined,Declined,Declined,,
Mr.,Niels,Bohr,,No Response,No Response,No Response,No Response,
"",Grace,Hopper,,Attending,Attending,Attending,short rib,
"",Alan,Turing,,Attending,Attending,Attending,short rib,
`;

async function importGuests(page: Page) {
  await page.getByTestId('tab-guests').click();
  await page.getByTestId('import-open').first().click();
  await page
    .getByTestId('import-file')
    .setInputFiles({ name: 'guests.csv', mimeType: 'text/csv', buffer: Buffer.from(GUESTS) });
  await page.getByTestId('import-next').click();
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('guest-counts')).toContainText(
    '7 total · 0 attending · 7 awaiting · 0 declined',
  );
}

test('update RSVPs from a Zola RSVP export', async ({ page }) => {
  await newPlan(page);
  await importGuests(page);
  await page.getByTestId('rsvp-open').click();
  await page
    .getByTestId('rsvp-file')
    .setInputFiles({ name: 'rsvps.csv', mimeType: 'text/csv', buffer: Buffer.from(RSVPS) });
  await expect(page.getByTestId('rsvp-event')).toHaveValue('6'); // Reception column
  const summary = page.getByTestId('rsvp-summary');
  await expect(summary).toContainText('5 → attending'); // Marie, Pierre, Rosalind, Grace, Alan (as Grace's plus-one)
  await expect(summary).toContainText('1 → declined'); // Rosalind's guest
  await page.getByTestId('rsvp-apply').click();
  await expect(page.getByTestId('guest-counts')).toContainText(
    '7 total · 5 attending · 1 awaiting · 1 declined',
  );
  await expect(page.getByText('Alan Turing', { exact: true })).toBeVisible(); // "Guest of Grace Hopper" got a name
  await expect(page.getByText('short rib').first()).toBeVisible(); // meal choice
  // declined guests drop out of the seating list; awaiting ones stay
  await page.getByTestId('tab-seating').click();
  await expect(page.getByTestId('seat-counts')).toContainText('6 to seat');
});

test('dropping an RSVP file into Import switches to the RSVP update', async ({ page }) => {
  await newPlan(page);
  await importGuests(page);
  await page.getByTestId('import-open').first().click();
  await page
    .getByTestId('import-file')
    .setInputFiles({ name: 'rsvps.csv', mimeType: 'text/csv', buffer: Buffer.from(RSVPS) });
  await expect(page.getByTestId('rsvp-review')).toBeVisible();
  await expect(page.getByTestId('guest-counts')).toContainText('7 total'); // nothing imported as new guests
});
