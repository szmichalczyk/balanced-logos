// Pure, framework-independent math for optical logo balancing.
// No DOM/canvas here so it can be unit-tested; canvas-dependent pixel work lives in logo-analysis.ts.

export type BalanceMetric = "ink" | "perceptual";

/** Intrinsic, scale-invariant description of a single logo, derived from its pixels. */
export type LogoAnalysis = {
  /** Tight ink bounding-box width in analysis pixels. */
  bboxWidth: number;
  /** Tight ink bounding-box height in analysis pixels. */
  bboxHeight: number;
  /** bboxWidth / bboxHeight. */
  aspect: number;
  /** Sum of alpha (0..1) over the trimmed region — total "ink". */
  inkMass: number;
  /** bboxWidth * bboxHeight. */
  area: number;
  /**
   * Ink coverage density = inkMass / area. Scale-invariant: it measures how much
   * ink sits per unit area, i.e. stroke heaviness. Bold => high, thin => low.
   */
  density: number;
  /** Alpha-weighted mean CIE L* (0..100) of the ink pixels' original colors. */
  meanInkLstar: number;
};

export type BalanceParams = {
  metric: BalanceMetric;
  /** Correction exponent [0..1]. 0 = pure height-fit, 1 = full inverse-density correction. */
  strength: number;
  /** Fraction of the frame height the average logo fills (0..1). */
  baseFill: number;
  /** Frame background CIE L* (0..100) — used by the perceptual metric. */
  backgroundLstar: number;
  /** If recoloring, the target color's CIE L* (0..100); otherwise null to use each logo's own ink L*. */
  recolorLstar: number | null;
  /** Per-logo manual multipliers, aligned with the analyses array (default 1). */
  nudges?: readonly number[];
};

export const MIN_FILL_RATIO = 0.15;
export const MAX_FILL_RATIO = 0.98;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** sRGB channel (0..255) -> linear (0..1). */
function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance Y (0..1) from an sRGB color. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/** CIE L* perceptual lightness (0..100) from relative luminance Y (0..1). */
export function luminanceToLstar(luminance: number): number {
  const y = clamp(luminance, 0, 1);
  return y <= 216 / 24389 ? y * (24389 / 27) : 116 * Math.cbrt(y) - 16;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace(/^#/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  };
}

export function hexToLstar(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return luminanceToLstar(relativeLuminance(r, g, b));
}

/**
 * Perceived optical weight per unit height², used for balancing. It combines ink coverage density
 * with the logo's horizontal extent (aspect), because a wide wordmark occupies far more visual
 * area at a given height than a compact mark — so wide logos must render shorter to feel equal.
 * "perceptual" additionally scales by contrast against the frame background.
 */
export function effectiveDensity(analysis: LogoAnalysis, params: BalanceParams): number {
  // coverage × aspect ≈ ink area per unit height² (h × (h·aspect) × coverage / h²).
  const base = Math.max(analysis.density, 1e-4) * Math.max(analysis.aspect, 0.05);
  if (params.metric === "ink") {
    return base;
  }
  const targetLstar = params.recolorLstar ?? analysis.meanInkLstar;
  const contrast = Math.abs(targetLstar - params.backgroundLstar) / 100;
  // Floor the contrast so a near-invisible logo does not blow up to the max size.
  return base * Math.max(contrast, 0.05);
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) {
    return 1;
  }
  const sumLog = values.reduce((acc, value) => acc + Math.log(Math.max(value, 1e-6)), 0);
  return Math.exp(sumLog / values.length);
}

/**
 * Compute the height fill-ratio (rendered height / frame height) for each logo so all
 * logos feel equally weighted within the frame. Heavier logos get a smaller fraction.
 */
export function computeFillRatios(
  analyses: readonly LogoAnalysis[],
  params: BalanceParams,
): number[] {
  if (analyses.length === 0) {
    return [];
  }
  const weights = analyses.map((analysis) => effectiveDensity(analysis, params));
  const referenceWeight = geometricMean(weights);
  // Perceived mass ∝ weight × height²; equal mass means height ∝ weight^-0.5. Mapping the 0..1
  // strength to a 0..0.5 exponent makes 100% = equal perceived ink mass, 0% = equal height.
  const exponent = clamp(params.strength, 0, 1) * 0.5;

  return analyses.map((_, index) => {
    const correction = (referenceWeight / weights[index]) ** exponent;
    const nudge = params.nudges?.[index] ?? 1;
    return clamp(params.baseFill * correction * nudge, MIN_FILL_RATIO, MAX_FILL_RATIO);
  });
}

/** Rendered box (in frame-height units) for a logo given its fill ratio and the frame height. */
export function computeRenderedSize(
  analysis: LogoAnalysis,
  fillRatio: number,
  frameHeight: number,
): { width: number; height: number } {
  const height = frameHeight * fillRatio;
  return { width: height * analysis.aspect, height };
}
