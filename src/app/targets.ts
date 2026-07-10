// Single source of truth for control target strings and export helpers that read them.
// Shared by schema, renderer, and export so they never drift.

import type { ToolcraftState } from "@/toolcraft/runtime";

import type { BalanceMetric, BalanceParams } from "./balance-math";
import { hexToLstar } from "./balance-math";
import type { BoardFrame } from "./logo-board";
import type { LogoProcessingOptions } from "./logo-analysis";

export const TARGET = {
  frameHeight: "frame.height",
  framePadding: "frame.padding",
  frameFill: "frame.fill",
  frameFillColor: "frame.fillColor",
  frameBorder: "frame.border",
  paddingOverrides: "frame.paddingOverrides",
  balanceEnabled: "balance.enabled",
  metric: "balance.metric",
  strength: "balance.strength",
  recolor: "color.recolor",
  recolorValue: "color.value",
  knockout: "color.knockout",
  includeBackground: "export.includeBackground",
  background: "appearance.background",
  imageFormat: "export.image.format",
  imageResolution: "export.image.resolution",
  actions: "actions.output",
} as const;

// Fixed tuning that isn't (yet) exposed as controls — documented follow-ups.
const TRIM_TOLERANCE = 20; // background-removal color tolerance (%)
const BASE_FILL = 0.82; // fraction of frame height the average logo fills

export const ACTION = {
  exportPng: "export.png",
  exportSvg: "export.svg",
} as const;

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function hex(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object" && "hex" in value) {
    const maybe = (value as { hex?: unknown }).hex;
    if (typeof maybe === "string") {
      return maybe;
    }
  }
  return fallback;
}

export function readFrame(
  values: Record<string, unknown>,
  options: { forExport?: boolean } = {},
): BoardFrame {
  const frameHeight = num(values[TARGET.frameHeight], 96);
  const padding = num(values[TARGET.framePadding], 12);
  const fillOn = bool(values[TARGET.frameFill], false);
  return {
    frameHeight,
    paddingX: padding,
    paddingY: padding,
    // Space framed logos apart a little more than their inner padding so borders read clearly.
    gap: Math.max(padding, 8),
    fill: fillOn ? hex(values[TARGET.frameFillColor], "#FFFFFF") : null,
    // The border is a preview-only guide; it is never drawn into exported files.
    showBorder: options.forExport ? false : bool(values[TARGET.frameBorder], true),
  };
}

export function readProcessingOptions(
  values: Record<string, unknown>,
): LogoProcessingOptions {
  return {
    removeBackground: bool(values[TARGET.knockout], true),
    tolerance: TRIM_TOLERANCE,
  };
}

/** The solid recolor color if recoloring is on, else null. Applied at draw/export time. */
export function readRecolor(values: Record<string, unknown>): string | null {
  return bool(values[TARGET.recolor], false) ? hex(values[TARGET.recolorValue], "#111111") : null;
}

/**
 * @param themeBackgroundLstar CIE L* of the tool theme background (dark ~ 8, light ~ 96), used as
 *   the perceptual contrast reference when no per-frame Fill is set.
 */
export function readBalanceParams(
  values: Record<string, unknown>,
  themeBackgroundLstar = 8,
): BalanceParams {
  const metric = (values[TARGET.metric] === "perceptual" ? "perceptual" : "ink") as BalanceMetric;
  const enabled = bool(values[TARGET.balanceEnabled], true);
  const recolorOn = bool(values[TARGET.recolor], false);
  const recolorHex = hex(values[TARGET.recolorValue], "#111111");
  // Perceptual contrast reference: the frame Fill color when Fill is on, otherwise the tool theme.
  const fillOn = bool(values[TARGET.frameFill], false);
  const backgroundLstar = fillOn
    ? hexToLstar(hex(values[TARGET.frameFillColor], "#FFFFFF"))
    : themeBackgroundLstar;
  return {
    metric,
    // Balance off => equal height (0 strength) so the user can compare before/after.
    strength: enabled ? num(values[TARGET.strength], 50) / 100 : 0,
    baseFill: BASE_FILL,
    backgroundLstar,
    recolorLstar: recolorOn ? hexToLstar(recolorHex) : null,
  };
}

/** Read the tool theme background L* from the DOM (dark ~ 8, light ~ 96). Browser only. */
export function readThemeBackgroundLstar(): number {
  if (typeof document === "undefined") {
    return 8;
  }
  const theme = document
    .querySelector("[data-toolcraft-theme]")
    ?.getAttribute("data-toolcraft-theme");
  return theme === "light" ? 96 : 8;
}

/** Per-logo padding overrides keyed by asset id (px). Stored as a plain value target. */
export function readPaddingOverrides(values: Record<string, unknown>): Record<string, number> {
  const raw = values[TARGET.paddingOverrides];
  return raw && typeof raw === "object" ? (raw as Record<string, number>) : {};
}

/** Resolve per-logo paddings for the given asset ids (override or undefined to use the global). */
export function readPaddings(
  values: Record<string, unknown>,
  assetIds: readonly string[],
): (number | undefined)[] {
  const overrides = readPaddingOverrides(values);
  return assetIds.map((id) => (typeof overrides[id] === "number" ? overrides[id] : undefined));
}

export function readBackgroundHex(values: Record<string, unknown>): string {
  return hex(values[TARGET.background], "#FFFFFF");
}

export function readState(state: ToolcraftState): Record<string, unknown> {
  return state.values;
}
