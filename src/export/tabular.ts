// Guest list / roster exports (CSV + XLSX). Pure row builders are shared by both formats.
import Papa from 'papaparse';
import { fullName } from '../model/names';
import type { PlanDoc } from '../model/types';

export function guestRows(doc: PlanDoc): string[][] {
  const header = [
    'First name',
    'Last name',
    'Full name',
    'Table',
    'Seat',
    'Group',
    'RSVP',
    'Dietary',
    'Accessibility',
    'Household',
    'Notes',
  ];
  const parties = new Map<string, string>();
  let n = 1;
  const rows = Object.values(doc.guests)
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    .map((g) => {
      if (g.partyId && !parties.has(g.partyId)) parties.set(g.partyId, `H${n++}`);
      const t = g.tableId ? doc.tables[g.tableId] : null;
      return [
        g.firstName,
        g.lastName,
        fullName(g),
        t?.name ?? '',
        t && g.seat != null ? String(g.seat + 1) : '',
        g.groupId ? (doc.groups[g.groupId]?.name ?? '') : '',
        g.rsvp,
        g.dietary.join('; '),
        g.access.join('; '),
        g.partyId ? parties.get(g.partyId)! : '',
        g.notes,
      ];
    });
  return [header, ...rows];
}

export function rosterRows(doc: PlanDoc): string[][] {
  const out: string[][] = [['Table', 'Seat', 'Guest', 'Group', 'Dietary', 'Accessibility']];
  const tables = Object.values(doc.tables).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  for (const t of tables) {
    const gs = Object.values(doc.guests)
      .filter((g) => g.tableId === t.id)
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
    for (const g of gs)
      out.push([
        t.name,
        String((g.seat ?? 0) + 1),
        fullName(g),
        g.groupId ? (doc.groups[g.groupId]?.name ?? '') : '',
        g.dietary.join('; '),
        g.access.join('; '),
      ]);
    if (gs.length === 0) out.push([t.name, '', '(empty)', '', '', '']);
  }
  return out;
}

/** CSV with BOM so Excel opens UTF-8 names correctly. Cells that look like formulas are neutralised. */
export function toCsv(rows: string[][]): string {
  const safe = rows.map((r) => r.map((c) => (/^[=+\-@]/.test(c) ? `'${c}` : c)));
  return '\uFEFF' + Papa.unparse(safe, { newline: '\r\n' });
}

export async function toXlsx(doc: PlanDoc): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const sheet = (rows: string[][]) =>
    rows.map((r, i) =>
      r.map((value) => ({ value, type: String, fontWeight: i === 0 ? ('bold' as const) : undefined })),
    );
  return (await writeXlsxFile([sheet(guestRows(doc)), sheet(rosterRows(doc))], {
    sheets: ['Guests', 'Tables'],
    columns: [Array(11).fill({ width: 18 }), Array(6).fill({ width: 20 })],
  })) as unknown as Blob;
}

export function backupJson(doc: PlanDoc): string {
  return JSON.stringify(
    { app: 'wedding-seating', format: 1, exportedAt: new Date().toISOString(), doc },
    null,
    1,
  );
}
