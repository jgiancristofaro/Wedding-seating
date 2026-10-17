import type { Guest } from './types';

export const fullName = (g: Pick<Guest, 'firstName' | 'lastName'>) =>
  [g.firstName, g.lastName].filter(Boolean).join(' ').trim() || 'Unnamed guest';

export function initials(g: Pick<Guest, 'firstName' | 'lastName'>): string {
  const f = g.firstName.trim()[0] ?? '';
  const l = g.lastName.trim()[0] ?? '';
  return (f + l).toUpperCase() || '?';
}

export const nameKey = (g: Pick<Guest, 'firstName' | 'lastName'>) =>
  fullName(g)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Split "Smith, John" or "John Q. Smith" into first/last. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const s = full.trim().replace(/\s+/g, ' ');
  if (!s) return { firstName: '', lastName: '' };
  if (s.includes(',')) {
    const [last, first] = s.split(',', 2).map((p) => p.trim());
    return { firstName: first ?? '', lastName: last ?? '' };
  }
  const parts = s.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  // keep particles with the surname: "Anna van der Berg"
  const particles = new Set(['van', 'von', 'de', 'der', 'da', 'del', 'di', 'la', 'le', 'du', 'st.', 'bin', 'al']);
  let i = parts.length - 1;
  while (i > 1 && particles.has(parts[i - 1].toLowerCase())) i--;
  return { firstName: parts.slice(0, i).join(' '), lastName: parts.slice(i).join(' ') };
}

export function dietaryAbbrev(d: string): string {
  const k = d.toLowerCase();
  if (k.includes('vegan')) return 'VG';
  if (k.includes('veget')) return 'V';
  if (k.includes('gluten') || k.includes('celiac') || k.includes('coeliac')) return 'GF';
  if (k.includes('nut')) return 'N';
  if (k.includes('dairy') || k.includes('lactose')) return 'DF';
  if (k.includes('kosher')) return 'K';
  if (k.includes('halal')) return 'H';
  if (k.includes('shellfish') || k.includes('fish') || k.includes('pesc')) return 'F';
  if (k.includes('child') || k.includes('kid')) return 'C';
  return d.slice(0, 2).toUpperCase();
}
