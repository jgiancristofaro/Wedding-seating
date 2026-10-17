import Papa from 'papaparse';

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  /** true when the first row looked like data rather than headers */
  syntheticHeaders: boolean;
}

/** Decode bytes from a user file: honours UTF-8/UTF-16 BOMs, falls back to Windows-1252 for legacy Excel CSVs. */
export function decodeBytes(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return new TextDecoder('windows-1252').decode(b);
  }
}

export async function readFileText(file: File): Promise<string> {
  return decodeBytes(await file.arrayBuffer());
}

const HEADER_WORDS =
  /name|first|last|surname|guest|party|plus|group|side|relation|diet|meal|allerg|rsvp|status|attend|note|household|family|table|seat|access|email|phone|address|child|age/i;

/** Parse CSV / TSV / pasted spreadsheet text. Delimiter is auto-detected; quoted commas and newlines are handled. */
export function parseDelimited(input: string): ParsedTable {
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const firstLine = text.split('\n', 1)[0] ?? '';
  const delimiter = firstLine.includes('\t')
    ? '\t'
    : firstLine.split(';').length > firstLine.split(',').length
      ? ';'
      : ',';
  const res = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: 'greedy' });
  const all = res.data
    .map((r) => r.map((c) => (c ?? '').toString().trim()))
    .filter((r) => r.some((c) => c !== ''));
  if (all.length === 0) return { headers: [], rows: [], syntheticHeaders: false };
  const width = Math.max(...all.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
  const first = all[0];
  const looksLikeHeader = first.some((c) => HEADER_WORDS.test(c)) && !first.some((c) => /^\d+$/.test(c));
  if (looksLikeHeader) {
    const headers = pad(first).map((h, i) => h || `Column ${i + 1}`);
    return { headers, rows: all.slice(1).map(pad), syntheticHeaders: false };
  }
  return {
    headers: Array.from({ length: width }, (_, i) => `Column ${i + 1}`),
    rows: all.map(pad),
    syntheticHeaders: true,
  };
}
