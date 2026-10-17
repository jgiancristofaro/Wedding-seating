// Standalone SVG rendering of the plan with explicit colours (for SVG/PNG/PDF export; independent of app CSS).
import { NEUTRAL_SEAT } from '../lib/colors';
import { ELEMENT_DEFAULTS, isSegment } from '../model/factory';
import { initials } from '../model/names';
import { CHAIR_R, seatPositions } from '../model/seats';
import { planIndex } from '../model/selectors';
import type { PlanDoc } from '../model/types';
import { contentBounds } from '../features/canvas/bounds';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const f = (n: number) => Math.round(n * 10) / 10;

export interface SvgOptions {
  names?: boolean;
  backdropDataUrl?: string | null;
  title?: boolean;
}

export function renderPlanSvg(
  doc: PlanDoc,
  opts: SvgOptions = {},
): { svg: string; width: number; height: number } {
  const b = contentBounds(doc, !!opts.backdropDataUrl) ?? { x: 0, y: 0, w: 1000, h: 800 };
  const pad = 80;
  const top = opts.title ? 120 : 0;
  const vx = b.x - pad;
  const vy = b.y - pad - top;
  const W = b.w + pad * 2;
  const H = b.h + pad * 2 + top;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${f(vx)} ${f(vy)} ${f(W)} ${f(H)}" width="${f(W)}" height="${f(H)}" font-family="Helvetica, Arial, sans-serif">`,
  );
  out.push(`<rect x="${f(vx)}" y="${f(vy)}" width="${f(W)}" height="${f(H)}" fill="#ffffff"/>`);
  if (opts.title) {
    out.push(
      `<text x="${f(b.x + b.w / 2)}" y="${f(vy + 80)}" text-anchor="middle" font-family="Georgia, serif" font-size="56" fill="#24211d">${esc(doc.name)}</text>`,
    );
  }
  const bd = doc.backdrop;
  if (bd && opts.backdropDataUrl && doc.settings.layers !== 'vector') {
    out.push(
      `<image href="${opts.backdropDataUrl}" xlink:href="${opts.backdropDataUrl}" x="${f(bd.x)}" y="${f(bd.y)}" width="${f(bd.natW * bd.cmPerPx)}" height="${f(bd.natH * bd.cmPerPx)}" opacity="${bd.opacity}" preserveAspectRatio="none"/>`,
    );
  }
  if (doc.settings.layers !== 'image') {
    for (const e of Object.values(doc.elements)) {
      if (isSegment(e.kind)) {
        const x2 = e.x2 ?? e.x;
        const y2 = e.y2 ?? e.y;
        if (e.kind === 'wall')
          out.push(
            `<line x1="${f(e.x)}" y1="${f(e.y)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#3a3632" stroke-width="${f(e.w)}" stroke-linecap="square"/>`,
          );
        else if (e.kind === 'door')
          out.push(
            `<line x1="${f(e.x)}" y1="${f(e.y)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#ffffff" stroke-width="${f(e.w + 4)}"/><line x1="${f(e.x)}" y1="${f(e.y)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#8a6a55" stroke-width="3" stroke-dasharray="8 6"/>`,
          );
        else
          out.push(
            `<line x1="${f(e.x)}" y1="${f(e.y)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#9fc2d8" stroke-width="${f(e.w)}"/>`,
          );
        continue;
      }
      const label = esc(e.label ?? ELEMENT_DEFAULTS[e.kind].label);
      const fill =
        e.kind === 'danceFloor'
          ? '#f1ece4'
          : e.kind === 'bar' || e.kind === 'buffet' || e.kind === 'cake' || e.kind === 'gifts'
            ? '#f4e8df'
            : e.kind === 'label'
              ? 'none'
              : '#f3eee6';
      const stroke = e.kind === 'label' ? 'none' : '#b8ab9b';
      out.push(`<g transform="translate(${f(e.x)} ${f(e.y)}) rotate(${e.rotation})">`);
      out.push(
        e.kind === 'cake'
          ? `<ellipse rx="${f(e.w / 2)}" ry="${f(e.h / 2)}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
          : `<rect x="${f(-e.w / 2)}" y="${f(-e.h / 2)}" width="${f(e.w)}" height="${f(e.h)}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`,
      );
      const fs = Math.max(14, Math.min(30, Math.min(e.w, e.h) / 3.2));
      out.push(
        `<text text-anchor="middle" dy="0.35em" font-size="${f(fs)}" fill="#6b645a" letter-spacing="2" ${e.h > e.w * 1.6 ? 'transform="rotate(-90)"' : ''}>${label.toUpperCase()}</text></g>`,
      );
    }
  }
  const index = planIndex(doc);
  for (const t of Object.values(doc.tables)) {
    const seats = index.seating.get(t.id);
    out.push(`<g transform="translate(${f(t.x)} ${f(t.y)}) rotate(${t.rotation})">`);
    if (t.shape === 'round')
      out.push(`<circle r="${f(t.w / 2)}" fill="#ffffff" stroke="#bfb3a3" stroke-width="2"/>`);
    else if (t.shape === 'oval')
      out.push(
        `<ellipse rx="${f(t.w / 2)}" ry="${f(t.h / 2)}" fill="#ffffff" stroke="#bfb3a3" stroke-width="2"/>`,
      );
    else
      out.push(
        `<rect x="${f(-t.w / 2)}" y="${f(-t.h / 2)}" width="${f(t.w)}" height="${f(t.h)}" rx="8" fill="#ffffff" stroke="#bfb3a3" stroke-width="2"/>`,
      );
    seatPositions(t, t.capacity).forEach((s, i) => {
      const g = seats?.get(i);
      const color = g
        ? g.groupId && doc.groups[g.groupId]
          ? doc.groups[g.groupId].color
          : NEUTRAL_SEAT
        : '#ffffff';
      out.push(`<g transform="translate(${f(s.x)} ${f(s.y)})">`);
      out.push(
        `<circle r="${CHAIR_R}" fill="${color}" stroke="${g ? '#8f857a' : '#cfc6ba'}" stroke-width="2" ${g ? '' : 'stroke-dasharray="5 5"'}/>`,
      );
      if (g) {
        out.push(
          `<text transform="rotate(${-t.rotation})" text-anchor="middle" dy="0.35em" font-size="15" font-weight="bold" fill="#2a2520">${esc(initials(g))}</text>`,
        );
        if (opts.names) {
          const len = Math.hypot(s.x, s.y) || 1;
          const ox = s.x / len;
          const oy = s.y / len;
          const r = (t.rotation * Math.PI) / 180;
          const wx = ox * Math.cos(r) - oy * Math.sin(r);
          const anchor = wx > 0.35 ? 'start' : wx < -0.35 ? 'end' : 'middle';
          out.push(
            `<text transform="translate(${f(ox * (CHAIR_R + 10))} ${f(oy * (CHAIR_R + 10))}) rotate(${-t.rotation})" text-anchor="${anchor}" dy="0.35em" font-size="12" fill="#24211d" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(g.firstName)}</text>`,
          );
        }
      }
      out.push('</g>');
    });
    out.push(
      `<g transform="rotate(${-t.rotation})"><text text-anchor="middle" y="-2" font-family="Georgia, serif" font-size="20" font-weight="bold" fill="#24211d">${esc(t.name)}</text>`,
    );
    out.push(
      `<text text-anchor="middle" y="18" font-size="13" fill="#6b645a">${seats?.size ?? 0}/${t.capacity}</text></g></g>`,
    );
  }
  out.push('</svg>');
  return { svg: out.join(''), width: W, height: H };
}

export async function svgToPng(svg: string, width: number, height: number, targetPx = 4000): Promise<Blob> {
  const scale = Math.min(6, targetPx / Math.max(width, height));
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = Math.round(width * scale);
    c.height = Math.round(height * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}
