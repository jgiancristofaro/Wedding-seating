// Lightweight wall detection for floor plan images (no OpenCV): threshold dark ink, strip thin strokes (text,
// dimension lines), then extract long horizontal/vertical runs and merge them into segments. Venue plans are
// overwhelmingly axis-aligned; the result is offered as editable *suggestions*, never applied blindly.

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
}

export interface DetectOptions {
  /** minimum segment length as a fraction of the longer image side */
  minLenFrac?: number;
  /** strokes thinner than this (px) are treated as text/annotations */
  minThickness?: number;
}

export function otsu(gray: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[v]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

function erode(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // separable box erosion
  const tmp = new Uint8Array(m.length);
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ok = 1;
      for (let k = -r; k <= r && ok; k++) {
        const xx = x + k;
        if (xx < 0 || xx >= w || !m[y * w + xx]) ok = 0;
      }
      tmp[y * w + x] = ok;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let ok = 1;
      for (let k = -r; k <= r && ok; k++) {
        const yy = y + k;
        if (yy < 0 || yy >= h || !tmp[yy * w + x]) ok = 0;
      }
      out[y * w + x] = ok;
    }
  }
  return out;
}

function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(m.length);
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let k = -r; k <= r && !on; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w && m[y * w + xx]) on = 1;
      }
      tmp[y * w + x] = on;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let k = -r; k <= r && !on; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h && tmp[yy * w + x]) on = 1;
      }
      out[y * w + x] = on;
    }
  return out;
}

interface Run {
  a: number;
  b: number;
}

/** Collect runs along rows (horizontal) of the mask and stack them into bands. */
function bands(mask: Uint8Array, w: number, h: number, minLen: number, horizontal: boolean): Segment[] {
  const L = horizontal ? h : w; // lines to scan
  const N = horizontal ? w : h; // length of each line
  const at = (line: number, i: number) => (horizontal ? mask[line * w + i] : mask[i * w + line]);
  type Band = { a: number; b: number; start: number; end: number; lastLine: number };
  let open: Band[] = [];
  const done: Band[] = [];
  for (let line = 0; line < L; line++) {
    const runs: Run[] = [];
    let s = -1;
    for (let i = 0; i <= N; i++) {
      const on = i < N && at(line, i);
      if (on && s < 0) s = i;
      if (!on && s >= 0) {
        if (i - s >= minLen) runs.push({ a: s, b: i - 1 });
        s = -1;
      }
    }
    const next: Band[] = [];
    for (const r of runs) {
      const hit = open.find(
        (bd) =>
          bd.lastLine === line - 1 &&
          Math.min(bd.b, r.b) - Math.max(bd.a, r.a) > 0.7 * Math.min(bd.b - bd.a, r.b - r.a),
      );
      if (hit) {
        hit.a = Math.min(hit.a, r.a);
        hit.b = Math.max(hit.b, r.b);
        hit.lastLine = line;
        hit.end = line;
        next.push(hit);
      } else next.push({ a: r.a, b: r.b, start: line, end: line, lastLine: line });
    }
    for (const bd of open) if (!next.includes(bd)) done.push(bd);
    open = next;
  }
  done.push(...open);
  return done
    .filter((bd) => bd.end - bd.start + 1 <= Math.max(40, minLen / 2)) // a band thicker than this is a filled area
    .map((bd) => {
      const mid = (bd.start + bd.end) / 2;
      const thickness = bd.end - bd.start + 1;
      return horizontal
        ? { x1: bd.a, y1: mid, x2: bd.b, y2: mid, thickness }
        : { x1: mid, y1: bd.a, x2: mid, y2: bd.b, thickness };
    });
}

/** Merge collinear, overlapping or nearly-touching axis-aligned segments. */
export function mergeSegments(segs: Segment[], gap: number, tol: number): Segment[] {
  const horiz = segs.filter((s) => Math.abs(s.y1 - s.y2) < 1e-6);
  const vert = segs.filter((s) => Math.abs(s.x1 - s.x2) < 1e-6);
  const mergeAxis = (list: Segment[], h: boolean) => {
    const key = (s: Segment) => (h ? s.y1 : s.x1);
    const lo = (s: Segment) => (h ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2));
    const hi = (s: Segment) => (h ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2));
    const sorted = [...list].sort((a, b) => key(a) - key(b) || lo(a) - lo(b));
    const out: { k: number; a: number; b: number; t: number; n: number }[] = [];
    for (const s of sorted) {
      const m = out.find((o) => Math.abs(o.k - key(s)) <= tol && lo(s) <= o.b + gap && hi(s) >= o.a - gap);
      if (m) {
        m.k = (m.k * m.n + key(s)) / (m.n + 1);
        m.n++;
        m.a = Math.min(m.a, lo(s));
        m.b = Math.max(m.b, hi(s));
        m.t = Math.max(m.t, s.thickness);
      } else out.push({ k: key(s), a: lo(s), b: hi(s), t: s.thickness, n: 1 });
    }
    return out.map((o) =>
      h
        ? { x1: o.a, y1: o.k, x2: o.b, y2: o.k, thickness: o.t }
        : { x1: o.k, y1: o.a, x2: o.k, y2: o.b, thickness: o.t },
    );
  };
  return [...mergeAxis(horiz, true), ...mergeAxis(vert, false)];
}

export function detectWalls(
  img: { width: number; height: number; data: Uint8ClampedArray },
  opts: DetectOptions = {},
): Segment[] {
  const { width: w, height: h, data } = img;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++)
    gray[i] = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
  const thr = Math.min(otsu(gray), 170);
  let mask: Uint8Array = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = gray[i] <= thr ? 1 : 0;
  const minThick = opts.minThickness ?? Math.max(2, Math.round(Math.max(w, h) / 400));
  const r = Math.max(1, Math.floor(minThick / 2));
  mask = dilate(erode(mask, w, h, r), w, h, r); // opening removes thin strokes
  const minLen = Math.round((opts.minLenFrac ?? 0.04) * Math.max(w, h));
  const raw = [...bands(mask, w, h, minLen, true), ...bands(mask, w, h, minLen, false)];
  const merged = mergeSegments(raw, Math.max(w, h) * 0.015, Math.max(3, minThick * 2));
  return merged.filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) >= minLen).slice(0, 300);
}
