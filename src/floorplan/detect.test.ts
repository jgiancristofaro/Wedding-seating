import { describe, expect, it } from 'vitest';
import { detectWalls, mergeSegments, otsu } from './detect';

function canvas(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const rect = (x: number, y: number, rw: number, rh: number, v = 20) => {
    for (let yy = y; yy < y + rh; yy++)
      for (let xx = x; xx < x + rw; xx++) {
        const i = (yy * w + xx) * 4;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
  };
  return { img: { width: w, height: h, data }, rect };
}

describe('detectWalls', () => {
  it('finds the four walls of a room and ignores thin annotation lines', () => {
    const { img, rect } = canvas(400, 300);
    rect(20, 20, 360, 8); // top
    rect(20, 272, 360, 8); // bottom
    rect(20, 20, 8, 260); // left
    rect(372, 20, 8, 260); // right
    rect(60, 150, 200, 1); // thin dimension line
    for (let i = 0; i < 10; i++) rect(80 + i * 12, 100, 6, 1); // "text"
    const segs = detectWalls(img);
    const horiz = segs.filter((s) => s.y1 === s.y2);
    const vert = segs.filter((s) => s.x1 === s.x2);
    expect(horiz).toHaveLength(2);
    expect(vert).toHaveLength(2);
    const top = horiz.sort((a, b) => a.y1 - b.y1)[0];
    expect(top.y1).toBeGreaterThan(20);
    expect(top.y1).toBeLessThan(28);
    expect(top.x2 - top.x1).toBeGreaterThan(330);
  });

  it('joins a wall interrupted by a door gap only when the gap is small', () => {
    const merged = mergeSegments(
      [
        { x1: 0, y1: 10, x2: 100, y2: 10, thickness: 5 },
        { x1: 104, y1: 11, x2: 200, y2: 11, thickness: 5 },
        { x1: 300, y1: 10, x2: 400, y2: 10, thickness: 5 },
      ],
      6,
      3,
    );
    expect(merged).toHaveLength(2);
  });

  it('computes an Otsu threshold between two populations', () => {
    const g = new Uint8Array([...Array(100).fill(20), ...Array(100).fill(230)]);
    const t = otsu(g);
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThan(230);
  });
});
