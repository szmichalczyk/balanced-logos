// Browser/canvas-dependent logo processing. Analysis (optical weight, ink bbox) is measured on a
// small raster; RENDERING stays sharp — SVG logos keep their vector source (recolored in-markup and
// drawn/exported as vector), raster logos are processed at render resolution. Pairs with balance-math.ts.

import {
  hexToRgb,
  luminanceToLstar,
  relativeLuminance,
  type LogoAnalysis,
} from "./balance-math";

export type LogoProcessingOptions = {
  removeBackground: boolean;
  /** 0..100 — how aggressively near-background pixels are cleared. */
  tolerance: number;
};

export type ProcessedLogo = {
  analysis: LogoAnalysis;
  mimeType: string;
  /** Draw the trimmed logo (original colors + alpha) crisply into the given rect. */
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
  /**
   * For vector sources: guarantee a cached raster of at least (w×scale)×(h×scale) device pixels
   * so draw() stays sharp at that scale. Resolves true when a sharper raster was produced —
   * redraw to see it. Raster sources resolve false (their resolution is fixed at process time).
   */
  ensureSharpRaster: (w: number, h: number, scale: number) => Promise<boolean>;
  /**
   * Serialize the trimmed logo as an SVG fragment. When `recolor` is set, SVG sources emit a
   * recolored vector; raster sources emit a recolored embedded raster.
   */
  toSvg: (x: number, y: number, w: number, h: number, recolor?: string | null) => string;
};

/**
 * Draw a logo recolored to a solid target color using its alpha, via source-in compositing.
 * This is a fast, decode-free recolor applied at draw time (independent of processing).
 */
export function drawLogoRecolored(
  ctx: CanvasRenderingContext2D,
  logo: ProcessedLogo,
  x: number,
  y: number,
  w: number,
  h: number,
  recolor: string | null,
): void {
  if (!recolor || w <= 0 || h <= 0) {
    logo.draw(ctx, x, y, w, h);
    return;
  }
  // Composite at the destination's device scale (backing-store pixels), not CSS units, so
  // recoloring never softens a logo that the destination context renders at >1x.
  const t = ctx.getTransform();
  const scale = Math.max(Math.abs(t.a), Math.abs(t.d)) || 1;
  const tmp = createCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
  const tctx = tmp.getContext("2d");
  if (!tctx) {
    logo.draw(ctx, x, y, w, h);
    return;
  }
  tctx.scale(scale, scale);
  logo.draw(tctx, 0, 0, w, h);
  tctx.setTransform(1, 0, 0, 1, 0, 0);
  tctx.globalCompositeOperation = "source-in";
  tctx.fillStyle = recolor;
  tctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(tmp, x, y, w, h);
}

const ALPHA_EPS = 8; // 0..255; below this a pixel is treated as empty.
const ANALYSIS_MAX_EDGE = 512; // analysis raster cap (measurement only).
const RENDER_MAX_EDGE = 2048; // processed raster cap for raster logos (keeps recolor/knockout sharp).
const VECTOR_RASTER_MAX_EDGE = 8192; // per-logo cap when re-rasterizing vector sources for zoom/export.

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load logo image"));
    image.src = src;
  });
}

function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db) / 441.6729559300637;
}

function detectBackgroundColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): [number, number, number] {
  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (const index of corners) {
    rs.push(data[index]);
    gs.push(data[index + 1]);
    bs.push(data[index + 2]);
  }
  const median = (v: number[]): number => v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
  return [median(rs), median(gs), median(bs)];
}

function knockOutBackground(data: Uint8ClampedArray, width: number, height: number, tolerance: number): void {
  const [bgR, bgG, bgB] = detectBackgroundColor(data, width, height);
  const threshold = tolerance / 100;
  for (let i = 0; i < data.length; i += 4) {
    if (colorDistance(data[i], data[i + 1], data[i + 2], bgR, bgG, bgB) <= threshold) {
      data[i + 3] = 0;
    }
  }
}

type Bbox = { x: number; y: number; w: number; h: number };

/** Measure ink mass, mean L*, and the tight ink bbox (as fractions of the raster) over alpha. */
function measure(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { inkMass: number; meanInkLstar: number; bboxFrac: Bbox; bboxPx: Bbox } {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let inkMass = 0;
  let lstarAccum = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      if (alpha <= ALPHA_EPS) {
        continue;
      }
      const a = alpha / 255;
      inkMass += a;
      lstarAccum += a * luminanceToLstar(relativeLuminance(data[index], data[index + 1], data[index + 2]));
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const hasInk = maxX >= minX && maxY >= minY;
  const bx = hasInk ? minX : 0;
  const by = hasInk ? minY : 0;
  const bw = hasInk ? maxX - minX + 1 : width;
  const bh = hasInk ? maxY - minY + 1 : height;
  return {
    inkMass,
    meanInkLstar: inkMass > 0 ? lstarAccum / inkMass : 0,
    bboxFrac: { x: bx / width, y: by / height, w: bw / width, h: bh / height },
    bboxPx: { x: bx, y: by, w: bw, h: bh },
  };
}

function decodeSvgMarkup(dataUrl: string): string | null {
  const match = /^data:image\/svg\+xml(;charset=[^;,]*)?(;base64)?,(.*)$/is.exec(dataUrl);
  if (!match) {
    return null;
  }
  const payload = match[3];
  try {
    return match[2] ? atob(payload) : decodeURIComponent(payload);
  } catch {
    try {
      return match[2] ? atob(payload) : payload;
    } catch {
      return null;
    }
  }
}

/**
 * Inject a recolor style so the whole mark takes a solid target color. Uses !important to beat
 * presentation attributes and inline styles, and forces opacity/fill-opacity/stroke-opacity to 1 so
 * logos authored with partial opacity (e.g. HSBC) recolor to a fully opaque solid color instead of a
 * faded tint. Elements explicitly set to fill/stroke "none" are preserved so outline marks stay open.
 */
function recolorSvgMarkup(markup: string, color: string): string {
  const style =
    `<style>` +
    `*{fill:${color} !important;opacity:1 !important;fill-opacity:1 !important;stroke-opacity:1 !important;stop-opacity:1 !important;}` +
    `*[fill="none"]{fill:none !important;}` +
    `[stroke]:not([stroke="none"]){stroke:${color} !important;}` +
    `[stroke="none"]{stroke:none !important;}` +
    // Luminance masks/clips define visibility by the whiteness of their shapes — never recolor them,
    // or a white mask becomes a dim color and fades the whole logo (e.g. HSBC).
    `mask *,mask,clipPath *,clipPath{fill:#fff !important;stroke:#fff !important;fill-opacity:1 !important;opacity:1 !important;}` +
    `</style>`;
  return markup.replace(/(<svg\b[^>]*>)/i, `$1${style}`);
}

function svgToDataUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

/**
 * Rewrite the root <svg> tag so the browser rasterizes exactly the ink-bbox crop at an explicit
 * pixel size. Drawing the original <img> with a source crop makes browsers rasterize the SVG at
 * its intrinsic size first (often tiny) and upscale — blurry. An explicit width/height forces
 * vector rasterization at the requested resolution in every browser.
 */
function cropSvgMarkup(markup: string, vb: Bbox, dw: number, dh: number): string {
  return markup.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs.replace(
      /\s+(width|height|viewBox|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
      "",
    );
    return (
      `<svg${cleaned} width="${dw}" height="${dh}"` +
      ` viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="none">`
    );
  });
}

/** Read the source SVG's user-unit coordinate box (viewBox, else width/height) for vector cropping. */
function readSvgUserBox(markup: string, fallbackW: number, fallbackH: number): { w: number; h: number } {
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)/i.exec(markup);
  if (viewBox) {
    return { w: parseFloat(viewBox[1]) || fallbackW, h: parseFloat(viewBox[2]) || fallbackH };
  }
  const w = /\bwidth\s*=\s*["']?([\d.]+)/i.exec(markup);
  const h = /\bheight\s*=\s*["']?([\d.]+)/i.exec(markup);
  return { w: w ? parseFloat(w[1]) : fallbackW, h: h ? parseFloat(h[1]) : fallbackH };
}

export async function processLogo(
  dataUrl: string,
  mimeType: string,
  options: LogoProcessingOptions,
): Promise<ProcessedLogo> {
  const isSvg = /svg/i.test(mimeType);

  // --- Analysis on a small raster of the ORIGINAL (shape + weight only) ---
  const original = await loadImage(dataUrl);
  const iw = original.naturalWidth || original.width || 1;
  const ih = original.naturalHeight || original.height || 1;
  const aScale = Math.min(1, ANALYSIS_MAX_EDGE / Math.max(iw, ih));
  const aw = Math.max(1, Math.round(iw * aScale));
  const ah = Math.max(1, Math.round(ih * aScale));
  const aCanvas = createCanvas(aw, ah);
  const aCtx = aCanvas.getContext("2d", { willReadFrequently: true });
  if (!aCtx) {
    throw new Error("Canvas 2D context unavailable");
  }
  aCtx.drawImage(original, 0, 0, aw, ah);
  const aData = aCtx.getImageData(0, 0, aw, ah);
  if (options.removeBackground && !isSvg) {
    knockOutBackground(aData.data, aw, ah, options.tolerance);
  }
  const m = measure(aData.data, aw, ah);
  const area = Math.max(1, m.bboxFrac.w * aw * (m.bboxFrac.h * ah));
  const analysis: LogoAnalysis = {
    bboxWidth: m.bboxFrac.w * aw,
    bboxHeight: m.bboxFrac.h * ah,
    aspect: m.bboxFrac.h > 0 ? (m.bboxFrac.w * aw) / (m.bboxFrac.h * ah) : 1,
    inkMass: m.inkMass,
    area,
    density: m.inkMass / area,
    meanInkLstar: m.meanInkLstar,
  };

  if (isSvg) {
    // --- Vector path: draw/export crisply from the source SVG (recolor applied later, not baked). ---
    const markup = decodeSvgMarkup(dataUrl);
    const userBox = markup ? readSvgUserBox(markup, iw, ih) : { w: iw, h: ih };
    // Ink bbox in the SVG's intrinsic pixel space (for crisp drawImage crop).
    const srcX = m.bboxFrac.x * (original.naturalWidth || iw);
    const srcY = m.bboxFrac.y * (original.naturalHeight || ih);
    const srcW = m.bboxFrac.w * (original.naturalWidth || iw);
    const srcH = m.bboxFrac.h * (original.naturalHeight || ih);
    // Ink bbox in the SVG's user-unit space (for a vector viewBox crop on export).
    const vb = {
      x: m.bboxFrac.x * userBox.w,
      y: m.bboxFrac.y * userBox.h,
      w: m.bboxFrac.w * userBox.w,
      h: m.bboxFrac.h * userBox.h,
    };
    // Sharpest raster produced so far; only ever replaced by a larger one, so zooming back out
    // never degrades and zooming in upgrades once the async re-raster lands.
    let raster: { dw: number; dh: number; canvas: HTMLCanvasElement } | null = null;
    let inflight: Promise<boolean> = Promise.resolve(false);
    const rasterizeAt = async (dw: number, dh: number): Promise<boolean> => {
      if (!markup || dw <= 0 || dh <= 0 || (raster && raster.dw >= dw && raster.dh >= dh)) {
        return false;
      }
      try {
        const image = await loadImage(svgToDataUrl(cropSvgMarkup(markup, vb, dw, dh)));
        const out = createCanvas(dw, dh);
        const octx = out.getContext("2d");
        if (!octx) {
          return false;
        }
        octx.drawImage(image, 0, 0, dw, dh);
        raster = { dw, dh, canvas: out };
        return true;
      } catch {
        return false;
      }
    };
    return {
      analysis,
      mimeType,
      draw: (ctx, x, y, w, h) => {
        if (raster) {
          ctx.drawImage(raster.canvas, x, y, w, h);
          return;
        }
        // First paint before any ensureSharpRaster completes (intrinsic-size rasterization).
        ctx.drawImage(original, srcX, srcY, srcW, srcH, x, y, w, h);
      },
      ensureSharpRaster: (w, h, scale) => {
        const dw = Math.min(VECTOR_RASTER_MAX_EDGE, Math.ceil(w * scale));
        const dh = Math.min(VECTOR_RASTER_MAX_EDGE, Math.ceil(h * scale));
        // Serialize re-rasterizations so concurrent callers never race the shared cache.
        inflight = inflight.then(() => rasterizeAt(dw, dh));
        return inflight;
      },
      toSvg: (x, y, w, h, recolor) => {
        if (!markup) {
          return "";
        }
        const source = recolor ? recolorSvgMarkup(markup, recolor) : markup;
        const inner = source.replace(/^[\s\S]*?<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
        return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet" overflow="visible">${inner}</svg>`;
      },
    };
  }

  // --- Raster path: knockout + trim at render resolution (recolor applied later, not baked). ---
  const rScale = Math.min(1, RENDER_MAX_EDGE / Math.max(iw, ih));
  const rw = Math.max(1, Math.round(iw * rScale));
  const rh = Math.max(1, Math.round(ih * rScale));
  const full = createCanvas(rw, rh);
  const fCtx = full.getContext("2d", { willReadFrequently: true });
  if (!fCtx) {
    throw new Error("Canvas 2D context unavailable");
  }
  fCtx.drawImage(original, 0, 0, rw, rh);
  if (options.removeBackground) {
    const fData = fCtx.getImageData(0, 0, rw, rh);
    knockOutBackground(fData.data, rw, rh, options.tolerance);
    fCtx.putImageData(fData, 0, 0);
  }
  // Trim to ink bbox in render pixels.
  const tx = Math.round(m.bboxFrac.x * rw);
  const ty = Math.round(m.bboxFrac.y * rh);
  const tw = Math.max(1, Math.round(m.bboxFrac.w * rw));
  const th = Math.max(1, Math.round(m.bboxFrac.h * rh));
  const trimmed = createCanvas(tw, th);
  trimmed.getContext("2d")?.drawImage(full, tx, ty, tw, th, 0, 0, tw, th);

  function recoloredRaster(recolor: string): HTMLCanvasElement {
    const out = createCanvas(tw, th);
    const octx = out.getContext("2d");
    if (!octx) {
      return trimmed;
    }
    octx.drawImage(trimmed, 0, 0);
    octx.globalCompositeOperation = "source-in";
    octx.fillStyle = recolor;
    octx.fillRect(0, 0, tw, th);
    return out;
  }

  return {
    analysis,
    mimeType,
    draw: (ctx, x, y, w, h) => {
      ctx.drawImage(trimmed, x, y, w, h);
    },
    ensureSharpRaster: async () => false,
    toSvg: (x, y, w, h, recolor) => {
      const source = recolor ? recoloredRaster(recolor) : trimmed;
      return `<image x="${x}" y="${y}" width="${w}" height="${h}" href="${source.toDataURL("image/png")}" preserveAspectRatio="none"/>`;
    },
  };
}
