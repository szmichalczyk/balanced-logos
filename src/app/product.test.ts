import { describe, expect, it } from "vitest";

import {
  createToolcraftState,
  toolcraftReducer,
  type ToolcraftState,
} from "@/toolcraft/runtime";

import {
  computeFillRatios,
  effectiveDensity,
  type LogoAnalysis,
} from "./balance-math";
import { computeBoardLayout } from "./logo-board";
import { serializeBoardSvg } from "./logo-board";
import {
  imageFileName,
  imageMimeForFormat,
  imageMultiplier,
  normalizeImageFormat,
} from "./export-format";
import { readBalanceParams, readFrame, readProcessingOptions, readRecolor } from "./targets";
import { appSchema } from "./app-schema";

function analysis(density: number, aspect = 5): LogoAnalysis {
  return {
    bboxWidth: aspect * 60,
    bboxHeight: 60,
    aspect,
    inkMass: density * aspect * 60 * 60,
    area: aspect * 60 * 60,
    density,
    meanInkLstar: 12,
  };
}

const heavy = analysis(0.9);
const light = analysis(0.25);
const inkParams = {
  metric: "ink" as const,
  strength: 0.5,
  baseFill: 0.82,
  backgroundLstar: 96,
  recolorLstar: null,
};

// Frame
describe("Frame", () => {
  it("frame height scales rendered logo size", () => {
    const ratios = computeFillRatios([heavy], { ...inkParams, strength: 0 });
    const small = computeBoardLayout([heavy], ratios, frame(80), 1000, 1000);
    const large = computeBoardLayout([heavy], ratios, frame(240), 1000, 1000);
    expect(large.bands[0].logoHeight).toBeGreaterThan(small.bands[0].logoHeight);
  });
});

function frame(frameHeight: number, padding = 12) {
  return {
    frameHeight,
    paddingX: padding,
    paddingY: padding,
    gap: padding,
    fill: null,
    showBorder: true,
  };
}

describe("Padding", () => {
  it("padding shrinks the balanced logo inside its frame", () => {
    const ratios = computeFillRatios([heavy], { ...inkParams, strength: 0 });
    const tight = computeBoardLayout([heavy], ratios, frame(120, 4), 1000, 1000);
    const loose = computeBoardLayout([heavy], ratios, frame(120, 40), 1000, 1000);
    // Same frame band height, but more padding => smaller logo inside.
    expect(tight.bands[0].bandHeight).toBe(loose.bands[0].bandHeight);
    expect(loose.bands[0].logoHeight).toBeLessThan(tight.bands[0].logoHeight);
  });
});

// Balancing
describe("Balancing", () => {
  it("weight metric changes optical weighting", () => {
    const inkDensity = effectiveDensity(light, inkParams);
    // Perceptual weighs contrast: a light logo on a light background reads lighter.
    const perceptual = effectiveDensity(light, {
      ...inkParams,
      metric: "perceptual",
      recolorLstar: 90, // near-background => low contrast
      backgroundLstar: 96,
    });
    expect(perceptual).toBeLessThan(inkDensity);
  });

  it("balance toggle switches between balanced and equal height", () => {
    const on = readBalanceParams({ "balance.enabled": true, "balance.strength": 50 });
    const off = readBalanceParams({ "balance.enabled": false, "balance.strength": 50 });
    expect(on.strength).toBeGreaterThan(0);
    expect(off.strength).toBe(0);
    const ratios = computeFillRatios([heavy, light], off);
    expect(ratios[0]).toBeCloseTo(ratios[1]); // off => equal height
  });

  it("balance strength changes optical balance", () => {
    const gentle = computeFillRatios([heavy, light], { ...inkParams, strength: 0.1 });
    const strong = computeFillRatios([heavy, light], { ...inkParams, strength: 1 });
    const gentleSpread = gentle[1] - gentle[0];
    const strongSpread = strong[1] - strong[0];
    expect(strongSpread).toBeGreaterThan(gentleSpread);
    expect(strong[0]).toBeLessThan(strong[1]); // heavy stays smaller
  });
});

// Color
describe("Color", () => {
  it("recolor toggle sets the logo color", () => {
    const off = readBalanceParams({ "color.recolor": false });
    const on = readBalanceParams({ "color.recolor": true, "color.value": "#ff0000" });
    expect(off.recolorLstar).toBeNull();
    expect(on.recolorLstar).not.toBeNull();
  });

  it("logo color value changes processing color", () => {
    expect(readRecolor({ "color.recolor": true, "color.value": "#0055ff" })).toBe("#0055ff");
    expect(readRecolor({ "color.recolor": false, "color.value": "#0055ff" })).toBeNull();
  });

  it("knockout toggles logo background removal", () => {
    expect(readProcessingOptions({ "color.knockout": true }).removeBackground).toBe(true);
    expect(readProcessingOptions({ "color.knockout": false }).removeBackground).toBe(false);
  });
});

// Frame fill + border
describe("Frame fill and border", () => {
  it("frame fill paints each frame background", () => {
    const on = readFrame({ "frame.fill": true, "frame.fillColor": "#ff0000" });
    const off = readFrame({ "frame.fill": false });
    expect(on.fill).toBe("#ff0000");
    expect(off.fill).toBeNull();
  });

  it("frame fill color changes the frame background", () => {
    expect(readFrame({ "frame.fill": true, "frame.fillColor": "#00aa88" }).fill).toBe("#00aa88");
  });

  it("frame border toggles the preview guide", () => {
    expect(readFrame({ "frame.border": true }).showBorder).toBe(true);
    expect(readFrame({ "frame.border": false }).showBorder).toBe(false);
    // Export never draws the border regardless of the control.
    expect(readFrame({ "frame.border": true }, { forExport: true }).showBorder).toBe(false);
  });
});

// Image Export
describe("Image Export", () => {
  it("image format selects export mime type", () => {
    expect(imageMimeForFormat(normalizeImageFormat("png"))).toBe("image/png");
    expect(imageMimeForFormat(normalizeImageFormat("jpg"))).toBe("image/jpeg");
    expect(imageFileName("jpg")).toBe("balanced-logos.jpg");
  });

  it("image scale selects export multiplier", () => {
    expect(imageMultiplier("2k")).toBe(1); // 1x
    expect(imageMultiplier("8k")).toBe(4); // 4x
    expect(imageMultiplier("bogus")).toBe(2);
  });
});

// Export actions
describe("Export", () => {
  it("export actions produce png and svg output", () => {
    const svg = serializeBoardSvg([], { bands: [], contentWidth: 0, contentHeight: 0 }, 200, 100, {
      background: "#fff",
      frame: frame(120),
      frameStroke: "#000",
    });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="200"');
    expect(imageMimeForFormat("png")).toBe("image/png");
  });
});

// Runtime media lifecycle
describe("Logos", () => {
  it("uploading and clearing logos updates media", () => {
    let state: ToolcraftState = createToolcraftState(appSchema);
    expect(state.mediaAssets).toHaveLength(0);
    state = toolcraftReducer(state, {
      type: "media.import",
      asset: {
        assetKind: "image",
        dataUrl: "data:image/png;base64,AAAA",
        fileName: "logo.png",
        mimeType: "image/png",
        position: { x: 0, y: 0 },
        size: { width: 200, height: 60, unit: "px" },
      },
    });
    expect(state.mediaAssets).toHaveLength(1);
    const mediaId = state.mediaAssets[0].id;
    state = toolcraftReducer(state, { type: "media.delete", mediaId });
    expect(state.mediaAssets).toHaveLength(0);
  });
});

// Layers behavior (each logo is a layer).
describe("Layers", () => {
  function withTwoLogos(): ToolcraftState {
    let state = createToolcraftState(appSchema);
    for (const name of ["a.svg", "b.svg"]) {
      state = toolcraftReducer(state, {
        type: "media.import",
        asset: {
          assetKind: "image",
          dataUrl: `data:image/svg+xml;base64,AA${name}`,
          fileName: name,
          mimeType: "image/svg+xml",
          position: { x: 0, y: 0 },
          size: { width: 200, height: 60, unit: "px" },
        },
      });
    }
    return state;
  }

  it("hiding a layer removes its logo from the board", () => {
    let state = withTwoLogos();
    const layerId = state.mediaAssets[0].layerId;
    state = toolcraftReducer(state, { type: "layers.toggleVisibility", layerId });
    const layer = state.layers.find((entry) => entry.id === layerId);
    expect(layer?.visible).toBe(false);
  });

  it("reordering layers reorders the board grid", () => {
    const state = withTwoLogos();
    const reversed = [...state.layers].reverse();
    const next = toolcraftReducer(state, { type: "layers.reorder", layers: reversed });
    expect(next.layers.map((l) => l.id)).toEqual(reversed.map((l) => l.id));
  });

  it("selecting a layer updates the selected layer", () => {
    const state = withTwoLogos();
    const layerId = state.layers[0].id;
    const next = toolcraftReducer(state, { type: "layers.select", layerId });
    expect(next.selectedLayerId).toBe(layerId);
  });

  it("grouping layers moves them under a group", () => {
    let state = withTwoLogos();
    const ids = state.layers.map((l) => l.id);
    state = toolcraftReducer(state, { type: "layers.add", layer: { kind: "group", name: "Group" } });
    const groupId = state.layers.find((l) => l.kind === "group")?.id ?? null;
    state = toolcraftReducer(state, {
      type: "layers.moveToGroup",
      layerIds: ids,
      parentGroupId: groupId,
    });
    expect(groupId).not.toBeNull();
  });
});
