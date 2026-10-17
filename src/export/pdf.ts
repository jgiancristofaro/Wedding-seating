// PDF exports with jsPDF (lazy-loaded): overview, per-table pages, "find your seat" list, place & table cards.
import type { jsPDF as JsPdf } from 'jspdf';
import { fullName } from '../model/names';
import { seatPositions } from '../model/seats';
import type { Guest, PlanDoc, Table } from '../model/types';
import { renderPlanSvg, svgToPng, blobToDataUrl } from './svgRender';

export type Paper = 'letter' | 'a4' | 'legal' | 'a3' | 'tabloid';
export const PAPERS: { value: Paper; label: string }[] = [
  { value: 'letter', label: 'US Letter' },
  { value: 'a4', label: 'A4' },
  { value: 'legal', label: 'US Legal' },
  { value: 'tabloid', label: 'Tabloid (11×17)' },
  { value: 'a3', label: 'A3' },
];

const INK: [number, number, number] = [36, 33, 29];
const MUTED: [number, number, number] = [107, 100, 90];
const ACCENT: [number, number, number] = [138, 90, 68];

async function newDoc(paper: Paper, orientation: 'portrait' | 'landscape' = 'portrait'): Promise<JsPdf> {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'pt', format: paper, orientation });
}

const sortedTables = (doc: PlanDoc) =>
  Object.values(doc.tables).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
const guestsAt = (doc: PlanDoc, t: Table) =>
  Object.values(doc.guests)
    .filter((g) => g.tableId === t.id)
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
// jsPDF's built-in fonts are Latin-1 only; replace what they can't draw rather than printing garbage.
const safe = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\xFF]/g, '?');

function footer(pdf: JsPdf, doc: PlanDoc) {
  const n = pdf.getNumberOfPages();
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTED);
    pdf.text(`${safe(doc.name)} · page ${i} of ${n}`, W / 2, H - 18, { align: 'center' });
  }
}

export interface ChartPdfOptions {
  paper: Paper;
  overview: boolean;
  tables: boolean;
  lookup: boolean;
  backdropDataUrl?: string | null;
}

export async function seatingChartPdf(doc: PlanDoc, o: ChartPdfOptions): Promise<Blob> {
  const pdf = await newDoc(o.paper, 'landscape');
  let first = true;
  const page = (orientation: 'portrait' | 'landscape') => {
    if (!first) pdf.addPage(o.paper, orientation);
    first = false;
  };

  if (o.overview) {
    page('landscape');
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    pdf.setFont('times', 'bold');
    pdf.setFontSize(26);
    pdf.setTextColor(...INK);
    pdf.text(safe(doc.name), 36, 52);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...MUTED);
    const seated = Object.values(doc.guests).filter((g) => g.tableId).length;
    pdf.text(
      `${doc.eventDate ? doc.eventDate + ' · ' : ''}${seated} guests seated at ${Object.keys(doc.tables).length} tables`,
      36,
      70,
    );
    const { svg, width, height } = renderPlanSvg(doc, { names: true, backdropDataUrl: o.backdropDataUrl });
    const png = await blobToDataUrl(await svgToPng(svg, width, height, 3200));
    const maxW = W - 72;
    const maxH = H - 120;
    const s = Math.min(maxW / width, maxH / height);
    pdf.addImage(png, 'PNG', 36 + (maxW - width * s) / 2, 86, width * s, height * s, undefined, 'FAST');
  }

  if (o.tables) {
    for (const t of sortedTables(doc)) {
      page('portrait');
      tablePage(pdf, doc, t);
    }
  }

  if (o.lookup) {
    page('portrait');
    lookupPages(pdf, doc, o.paper);
  }
  footer(pdf, doc);
  return pdf.output('blob');
}

function tablePage(pdf: JsPdf, doc: PlanDoc, t: Table) {
  const W = pdf.internal.pageSize.getWidth();
  pdf.setFont('times', 'bold');
  pdf.setFontSize(30);
  pdf.setTextColor(...INK);
  pdf.text(safe(t.name), W / 2, 70, { align: 'center' });
  const gs = guestsAt(doc, t);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(...MUTED);
  pdf.text(`${gs.length} of ${t.capacity} seats`, W / 2, 90, { align: 'center' });

  // diagram
  const cx = W / 2;
  const cy = 250;
  const pos = seatPositions(t, t.capacity);
  const ext = Math.max(...pos.map((p) => Math.hypot(p.x, p.y)), t.w / 2, 1);
  const s = 120 / ext;
  const rot = (t.rotation * Math.PI) / 180;
  const R = (p: { x: number; y: number }) => ({
    x: cx + (p.x * Math.cos(rot) - p.y * Math.sin(rot)) * s,
    y: cy + (p.x * Math.sin(rot) + p.y * Math.cos(rot)) * s,
  });
  pdf.setDrawColor(191, 179, 163);
  pdf.setLineWidth(1);
  pdf.setFillColor(255, 255, 255);
  if (t.shape === 'round') pdf.circle(cx, cy, (t.w / 2) * s, 'FD');
  else if (t.shape === 'oval') pdf.ellipse(cx, cy, (t.w / 2) * s, (t.h / 2) * s, 'FD');
  else {
    const corners = [
      { x: -t.w / 2, y: -t.h / 2 },
      { x: t.w / 2, y: -t.h / 2 },
      { x: t.w / 2, y: t.h / 2 },
      { x: -t.w / 2, y: t.h / 2 },
    ].map(R);
    pdf.lines(
      corners
        .slice(1)
        .map((c, i) => [c.x - corners[i].x, c.y - corners[i].y])
        .concat([[corners[0].x - corners[3].x, corners[0].y - corners[3].y]]),
      corners[0].x,
      corners[0].y,
      [1, 1],
      'FD',
      true,
    );
  }
  const bySeat = new Map(gs.map((g) => [g.seat, g]));
  pos.forEach((p, i) => {
    const q = R(p);
    const g = bySeat.get(i);
    pdf.setFillColor(
      ...(g
        ? hex(g.groupId ? (doc.groups[g.groupId]?.color ?? '#EFE9E1') : '#EFE9E1')
        : ([255, 255, 255] as [number, number, number])),
    );
    pdf.circle(q.x, q.y, 11, 'FD');
    pdf.setFontSize(8);
    pdf.setTextColor(...INK);
    pdf.text(String(i + 1), q.x, q.y + 3, { align: 'center' });
    if (g) {
      const dx = q.x - cx;
      const align = dx > 10 ? 'left' : dx < -10 ? 'right' : 'center';
      const lx = q.x + (align === 'left' ? 15 : align === 'right' ? -15 : 0);
      const ly = q.y + (align === 'center' ? (q.y > cy ? 24 : -16) : 3);
      pdf.setFontSize(8);
      pdf.text(safe(g.firstName), lx, ly, { align });
    }
  });

  // roster
  let y = 430;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...MUTED);
  pdf.text('SEAT', 60, y);
  pdf.text('GUEST', 100, y);
  pdf.text('MEAL / NEEDS', 330, y);
  y += 8;
  pdf.setDrawColor(228, 219, 206);
  pdf.line(60, y, W - 60, y);
  y += 16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(...INK);
  for (const g of gs) {
    pdf.text(String((g.seat ?? 0) + 1), 60, y);
    pdf.text(safe(fullName(g)), 100, y);
    pdf.text(safe([g.meal, ...g.dietary, ...g.access].filter(Boolean).join(', ') || '-'), 330, y, {
      maxWidth: W - 390,
    });
    y += 20;
  }
  if (!gs.length) {
    pdf.setTextColor(...MUTED);
    pdf.text('No guests seated yet.', 100, y);
  }
}

function lookupPages(pdf: JsPdf, doc: PlanDoc, paper: Paper) {
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const guests: Guest[] = Object.values(doc.guests)
    .filter((g) => g.tableId && doc.tables[g.tableId])
    .sort(
      (a, b) =>
        (a.lastName || a.firstName).localeCompare(b.lastName || b.firstName) ||
        a.firstName.localeCompare(b.firstName),
    );
  const cols = W > 700 ? 3 : 2;
  const colW = (W - 72) / cols;
  const header = () => {
    pdf.setFont('times', 'bold');
    pdf.setFontSize(26);
    pdf.setTextColor(...INK);
    pdf.text('Find your seat', W / 2, 60, { align: 'center' });
    pdf.setDrawColor(...ACCENT);
    pdf.line(W / 2 - 40, 72, W / 2 + 40, 72);
  };
  header();
  const top = 100;
  const lh = 17;
  const perCol = Math.floor((H - top - 40) / lh);
  let i = 0;
  let letter = '';
  for (const g of guests) {
    const L = (g.lastName || g.firstName)[0]?.toUpperCase() ?? '';
    const items: { text: string; table?: string; head?: boolean }[] = [];
    if (L !== letter) {
      letter = L;
      items.push({ text: L, head: true });
    }
    items.push({
      text: `${g.lastName ? g.lastName + ', ' : ''}${g.firstName}`,
      table: doc.tables[g.tableId!].name,
    });
    for (const it of items) {
      if (i >= perCol * cols) {
        pdf.addPage(paper, 'portrait');
        header();
        i = 0;
      }
      const c = Math.floor(i / perCol);
      const r = i % perCol;
      const x = 36 + c * colW;
      const y = top + r * lh;
      if (it.head) {
        pdf.setFont('times', 'bold');
        pdf.setFontSize(13);
        pdf.setTextColor(...ACCENT);
        pdf.text(safe(it.text), x, y);
      } else {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(...INK);
        pdf.text(safe(it.text), x, y, { maxWidth: colW - 70 });
        pdf.setTextColor(...MUTED);
        pdf.text(safe(it.table!), x + colW - 14, y, { align: 'right' });
      }
      i++;
    }
  }
  if (!guests.length) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(12);
    pdf.text('Nobody is seated yet.', W / 2, top, { align: 'center' });
  }
}

function hex(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) return [239, 233, 225];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Folded tent place cards, 4 per page (fold along the dashed line). */
export async function placeCardsPdf(doc: PlanDoc, paper: Paper): Promise<Blob> {
  const pdf = await newDoc(paper, 'portrait');
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const guests = Object.values(doc.guests)
    .filter((g) => g.tableId && doc.tables[g.tableId])
    .sort(
      (a, b) =>
        doc.tables[a.tableId!].name.localeCompare(doc.tables[b.tableId!].name, undefined, {
          numeric: true,
        }) || (a.seat ?? 0) - (b.seat ?? 0),
    );
  const cw = W / 2;
  const ch = H / 2;
  guests.forEach((g, i) => {
    if (i > 0 && i % 4 === 0) pdf.addPage(paper, 'portrait');
    const x = (i % 2) * cw;
    const y = Math.floor((i % 4) / 2) * ch;
    pdf.setDrawColor(200, 190, 178);
    pdf.setLineDashPattern([2, 3], 0);
    pdf.rect(x + 10, y + 10, cw - 20, ch - 20);
    pdf.line(x + 10, y + ch / 2, x + cw - 10, y + ch / 2);
    pdf.setLineDashPattern([], 0);
    const midY = y + ch * 0.75;
    pdf.setFont('times', 'bolditalic');
    pdf.setFontSize(fullName(g).length > 22 ? 18 : 24);
    pdf.setTextColor(...INK);
    pdf.text(safe(fullName(g)), x + cw / 2, midY - 6, { align: 'center', maxWidth: cw - 40 });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(...ACCENT);
    pdf.text(safe(doc.tables[g.tableId!].name.toUpperCase()), x + cw / 2, midY + 18, {
      align: 'center',
      charSpace: 1.5,
    });
    const extras = [g.meal, ...g.dietary].filter(Boolean);
    if (extras.length) {
      pdf.setFontSize(8);
      pdf.setTextColor(...MUTED);
      pdf.text(safe(extras.join(' · ')), x + cw / 2, midY + 34, { align: 'center' });
    }
  });
  if (!guests.length) pdf.text('Seat some guests first.', W / 2, H / 2, { align: 'center' });
  return pdf.output('blob');
}

/** One table-number card per page. */
export async function tableCardsPdf(doc: PlanDoc, paper: Paper): Promise<Blob> {
  const pdf = await newDoc(paper, 'landscape');
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  sortedTables(doc).forEach((t, i) => {
    if (i > 0) pdf.addPage(paper, 'landscape');
    pdf.setDrawColor(...ACCENT);
    pdf.setLineWidth(1.2);
    pdf.rect(28, 28, W - 56, H - 56);
    pdf.setLineWidth(0.5);
    pdf.rect(36, 36, W - 72, H - 72);
    const m = /(\d+)\s*$/.exec(t.name);
    pdf.setTextColor(...INK);
    if (m) {
      pdf.setFont('times', 'italic');
      pdf.setFontSize(28);
      pdf.text('Table', W / 2, H / 2 - 70, { align: 'center' });
      pdf.setFont('times', 'normal');
      pdf.setFontSize(150);
      pdf.text(m[1], W / 2, H / 2 + 60, { align: 'center' });
    } else {
      pdf.setFont('times', 'italic');
      pdf.setFontSize(64);
      pdf.text(safe(t.name), W / 2, H / 2 + 20, { align: 'center', maxWidth: W - 120 });
    }
  });
  return pdf.output('blob');
}
