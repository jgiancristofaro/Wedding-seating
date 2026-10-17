// Client-side loading + downscaling of floor plan images. PDFs render their first page via pdf.js (lazy).
import { MAX_ASSET_BYTES } from '../persistence/backend';

export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MAX_DIM = 2400;

export interface LoadedImage {
  blob: Blob;
  width: number;
  height: number;
}

export class ImageLoadError extends Error {}

async function canvasToBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new ImageLoadError('Could not encode image'))), type, q),
  );
}

async function renderPdfFirstPage(file: File): Promise<HTMLCanvasElement> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, MAX_DIM / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width);
  c.height = Math.round(vp.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas: c } as Parameters<typeof page.render>[0])
    .promise;
  return c;
}

async function decodeBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Safari can decode HEIC via <img> even when createImageBitmap refuses.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

export async function loadFloorPlanFile(file: File): Promise<LoadedImage> {
  if (file.size > MAX_INPUT_BYTES)
    throw new ImageLoadError('That file is over 25 MB. Try a smaller export or a screenshot.');
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
  let source: CanvasImageSource;
  let w: number;
  let h: number;
  if (isPdf) {
    const c = await renderPdfFirstPage(file).catch(() => {
      throw new ImageLoadError('That PDF couldn’t be read. Try exporting the floor plan as a PNG or JPG.');
    });
    source = c;
    w = c.width;
    h = c.height;
  } else {
    if (!/^image\//.test(file.type) && !isHeic && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name))
      throw new ImageLoadError('Please choose an image (JPG, PNG) or a PDF.');
    const bmp = await decodeBitmap(file).catch(() => {
      throw new ImageLoadError(
        isHeic
          ? 'This browser can’t open HEIC photos. On iPhone, set Camera → Formats → Most Compatible, or export as JPG.'
          : 'That image couldn’t be opened.',
      );
    });
    source = bmp;
    w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
    h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  }
  if (!w || !h) throw new ImageLoadError('That image appears to be empty.');
  let scale = Math.min(1, MAX_DIM / Math.max(w, h));
  for (let attempt = 0; attempt < 5; attempt++) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, c.width, c.height);
    const blob = await canvasToBlob(c, 'image/jpeg', 0.86 - attempt * 0.08);
    if (blob.size <= MAX_ASSET_BYTES * 0.9) return { blob, width: c.width, height: c.height };
    scale *= 0.75;
  }
  throw new ImageLoadError('That image is too detailed to store. Try a smaller version.');
}

/** Pixels for the line detector (downscaled). */
export async function imageDataFromUrl(
  url: string,
  maxDim = 1000,
): Promise<{ data: ImageData; scale: number }> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { data: ctx.getImageData(0, 0, c.width, c.height), scale };
}
