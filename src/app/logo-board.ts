// Board layout + drawing shared by the live canvas preview and PNG/SVG export.
// Layout math is pure (unit-tested); drawBoard/serializeBoardSvg use it at render time.

import { computeFillRatios, type BalanceParams, type LogoAnalysis } from "./balance-math";
import { drawLogoRecolored, type ProcessedLogo } from "./logo-analysis";

export type BoardFrame = {
  frameHeight: number;
  paddingX: number;
  paddingY: number;
  gap: number;
  /** Background fill for each frame box, or null for transparent. */
  fill: string | null;
  /** Draw a hairline guide around each frame band (preview only; never exported). */
  showBorder: boolean;
};

export type BoardBand = {
  /** Frame band rectangle (full board width). */
  bandX: number;
  bandY: number;
  bandWidth: number;
  bandHeight: number;
  /** Balanced logo rectangle, centered in the band. */
  logoX: number;
  logoY: number;
  logoWidth: number;
  logoHeight: number;
};

export type BoardLayout = {
  bands: BoardBand[];
  contentWidth: number;
  contentHeight: number;
};

/**
 * Enclose each logo in its own frame box of identical height (the "mother frame") with inner
 * padding, optically balancing the logo (heavier logos smaller) to fit the padded inner area.
 * Frames wrap left-to-right into centered rows so the whole set reads as a tidy bordered cloud.
 */
export function computeBoardLayout(
  analyses: readonly LogoAnalysis[],
  fillRatios: readonly number[],
  frame: BoardFrame,
  boardWidth: number,
  boardHeight: number,
  /** Optional per-logo padding overrides (px); falls back to frame.paddingY for unset logos. */
  paddings?: readonly (number | undefined)[],
): BoardLayout {
  const count = analyses.length;
  if (count === 0) {
    return { bands: [], contentWidth: 0, contentHeight: 0 };
  }

  const frameHeight = Math.max(1, frame.frameHeight);

  // 1) Size each logo + its frame box from the balanced inner height, honoring per-logo padding.
  const boxes = analyses.map((analysis, index) => {
    const pad = Math.max(0, paddings?.[index] ?? frame.paddingY);
    const innerHeight = Math.max(1, frameHeight - pad * 2);
    const maxInnerWidth = Math.max(1, boardWidth - pad * 2);
    const targetHeight = innerHeight * fillRatios[index];
    const rawWidth = targetHeight * analysis.aspect;
    const widthScale = rawWidth > maxInnerWidth ? maxInnerWidth / rawWidth : 1;
    const logoWidth = rawWidth * widthScale;
    const logoHeight = targetHeight * widthScale;
    return {
      logoWidth,
      logoHeight,
      pad,
      frameWidth: logoWidth + pad * 2,
      frameHeight,
    };
  });

  // 2) Flow the frame boxes into rows that wrap at the board width.
  const rows: number[][] = [];
  let current: number[] = [];
  let rowWidth = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    const boxWidth = boxes[i].frameWidth;
    const projected = current.length === 0 ? boxWidth : rowWidth + frame.gap + boxWidth;
    if (current.length > 0 && projected > boardWidth) {
      rows.push(current);
      current = [i];
      rowWidth = boxWidth;
    } else {
      current.push(i);
      rowWidth = projected;
    }
  }
  if (current.length > 0) {
    rows.push(current);
  }

  // 3) Center the block vertically and each row horizontally.
  const contentHeight = rows.length * frameHeight + (rows.length - 1) * frame.gap;
  const startY = Math.max(0, (boardHeight - contentHeight) / 2);

  const bands: BoardBand[] = new Array(count);
  let contentWidth = 0;
  rows.forEach((rowIndices, rowNumber) => {
    const totalRowWidth =
      rowIndices.reduce((sum, i) => sum + boxes[i].frameWidth, 0) +
      (rowIndices.length - 1) * frame.gap;
    contentWidth = Math.max(contentWidth, totalRowWidth);
    let x = Math.max(0, (boardWidth - totalRowWidth) / 2);
    const bandY = startY + rowNumber * (frameHeight + frame.gap);
    for (const i of rowIndices) {
      const box = boxes[i];
      bands[i] = {
        bandX: x,
        bandY,
        bandWidth: box.frameWidth,
        bandHeight: frameHeight,
        logoX: x + box.pad,
        logoY: bandY + (frameHeight - box.logoHeight) / 2,
        logoWidth: box.logoWidth,
        logoHeight: box.logoHeight,
      };
      x += box.frameWidth + frame.gap;
    }
  });

  return { bands, contentWidth, contentHeight };
}

export function computeBoardFillRatios(
  logos: readonly ProcessedLogo[],
  params: BalanceParams,
): number[] {
  return computeFillRatios(
    logos.map((logo) => logo.analysis),
    params,
  );
}

/**
 * Lay the balanced framed logos out as a tight pack sized to their own content (independent of any
 * canvas artboard). Returns bands translated to a (0,0) origin plus the exact content dimensions,
 * so PNG/SVG export can size the output to the logos themselves.
 */
export function computePackLayout(
  analyses: readonly LogoAnalysis[],
  fillRatios: readonly number[],
  frame: BoardFrame,
  paddings?: readonly (number | undefined)[],
): { bands: BoardBand[]; width: number; height: number } {
  const count = analyses.length;
  if (count === 0) {
    return { bands: [], width: 0, height: 0 };
  }
  // Aim for a roughly square pack: estimate average frame width and pick a column target.
  const avgFrameWidth =
    analyses.reduce((sum, analysis, index) => {
      const pad = Math.max(0, paddings?.[index] ?? frame.paddingY);
      const logoHeight = Math.max(1, frame.frameHeight - pad * 2) * fillRatios[index];
      return sum + logoHeight * analysis.aspect + pad * 2;
    }, 0) / count;
  const cols = Math.max(1, Math.round(Math.sqrt(count)));
  const boardWidth = Math.max(1, cols * (avgFrameWidth + frame.gap));

  const layout = computeBoardLayout(analyses, fillRatios, frame, boardWidth, 10_000_000, paddings);
  if (layout.bands.length === 0) {
    return { bands: [], width: 0, height: 0 };
  }
  const minX = Math.min(...layout.bands.map((band) => band.bandX));
  const minY = Math.min(...layout.bands.map((band) => band.bandY));
  const maxX = Math.max(...layout.bands.map((band) => band.bandX + band.bandWidth));
  const maxY = Math.max(...layout.bands.map((band) => band.bandY + band.bandHeight));
  const bands = layout.bands.map((band) => ({
    ...band,
    bandX: band.bandX - minX,
    bandY: band.bandY - minY,
    logoX: band.logoX - minX,
    logoY: band.logoY - minY,
  }));
  return { bands, width: maxX - minX, height: maxY - minY };
}

export type DrawBoardOptions = {
  frame: BoardFrame;
  frameStroke: string;
  /** Recolor every logo to this solid color (applied at draw time), or null to keep originals. */
  recolor?: string | null;
};

/** Draw the balanced board onto a 2D context. Background is the caller's responsibility. */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  logos: readonly ProcessedLogo[],
  layout: BoardLayout,
  options: DrawBoardOptions,
): void {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  layout.bands.forEach((band, index) => {
    if (options.frame.fill) {
      ctx.save();
      ctx.fillStyle = options.frame.fill;
      ctx.fillRect(band.bandX, band.bandY, band.bandWidth, band.bandHeight);
      ctx.restore();
    }
    if (options.frame.showBorder) {
      ctx.save();
      ctx.strokeStyle = options.frameStroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(band.bandX + 0.5, band.bandY + 0.5, band.bandWidth - 1, band.bandHeight - 1);
      ctx.restore();
    }
    const logo = logos[index];
    if (logo && band.logoWidth > 0 && band.logoHeight > 0) {
      drawLogoRecolored(
        ctx,
        logo,
        band.logoX,
        band.logoY,
        band.logoWidth,
        band.logoHeight,
        options.recolor ?? null,
      );
    }
  });
}

/** Serialize the board as an SVG document with each logo embedded as a PNG data-URI image. */
export function serializeBoardSvg(
  logos: readonly ProcessedLogo[],
  layout: BoardLayout,
  boardWidth: number,
  boardHeight: number,
  options: { background: string | null; frame: BoardFrame; frameStroke: string },
): string {
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${boardWidth}" height="${boardHeight}" viewBox="0 0 ${boardWidth} ${boardHeight}">`,
  );
  if (options.background) {
    parts.push(`<rect width="${boardWidth}" height="${boardHeight}" fill="${options.background}"/>`);
  }
  layout.bands.forEach((band, index) => {
    if (options.frame.fill) {
      parts.push(
        `<rect x="${band.bandX}" y="${band.bandY}" width="${band.bandWidth}" height="${band.bandHeight}" fill="${options.frame.fill}"/>`,
      );
    }
    if (options.frame.showBorder) {
      parts.push(
        `<rect x="${band.bandX + 0.5}" y="${band.bandY + 0.5}" width="${band.bandWidth - 1}" height="${band.bandHeight - 1}" fill="none" stroke="${options.frameStroke}" stroke-width="1"/>`,
      );
    }
    const logo = logos[index];
    if (logo && band.logoWidth > 0 && band.logoHeight > 0) {
      parts.push(logo.toSvg(band.logoX, band.logoY, band.logoWidth, band.logoHeight));
    }
  });
  parts.push("</svg>");
  return parts.join("");
}

/** Serialize a single framed logo as a standalone SVG document (for one-file-per-logo export). */
export function serializeFramedLogoSvg(
  logo: ProcessedLogo,
  band: BoardBand,
  fill: string | null,
  recolor?: string | null,
): string {
  const w = band.bandWidth;
  const h = band.bandHeight;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
  ];
  if (fill) {
    parts.push(`<rect width="${w}" height="${h}" fill="${fill}"/>`);
  }
  // Logo positioned relative to the frame origin.
  parts.push(
    logo.toSvg(band.logoX - band.bandX, band.logoY - band.bandY, band.logoWidth, band.logoHeight, recolor),
  );
  parts.push("</svg>");
  return parts.join("");
}
