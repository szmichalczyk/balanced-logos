// Pure helpers mapping the Image Export controls to concrete export parameters.
// PNG exports at retina multipliers (1x/2x/4x); SVG exports at true 1x scale.

export type ImageFormat = "png" | "jpg";

export function normalizeImageFormat(value: unknown): ImageFormat {
  return value === "jpg" ? "jpg" : "png";
}

export function imageMimeForFormat(format: ImageFormat): string {
  return format === "jpg" ? "image/jpeg" : "image/png";
}

export function imageFileName(format: ImageFormat): string {
  return `balanced-logos.${format}`;
}

/** JPG has no alpha, so it must always paint the background. */
export function shouldForceBackground(format: ImageFormat): boolean {
  return format === "jpg";
}

// The runtime contract requires the resolution value strings 2k/4k/8k; the product presents them
// as retina multipliers 1x/2x/4x. This maps the required value strings to the real pixel multiplier.
const MULTIPLIERS: Record<string, number> = { "2k": 1, "4k": 2, "8k": 4 };

/** Retina pixel multiplier for PNG export: 1x/2x/4x (default 2x). */
export function imageMultiplier(value: unknown): number {
  return typeof value === "string" && MULTIPLIERS[value] ? MULTIPLIERS[value] : 2;
}
