// Export each balanced logo as its own file (framed, sized to the logo — canvas-independent),
// packed into a single ZIP download. PNG uses a retina multiplier (1x/2x/4x); SVG is true 1x vector.

import {
  createToolcraftPngExportCanvas,
  type ToolcraftState,
} from "@/toolcraft/runtime";

import {
  imageMimeForFormat,
  imageMultiplier,
  normalizeImageFormat,
  type ImageFormat,
} from "./export-format";
import { drawLogoRecolored, processLogo, type ProcessedLogo } from "./logo-analysis";
import {
  computeBoardFillRatios,
  computePackLayout,
  serializeFramedLogoSvg,
  type BoardBand,
} from "./logo-board";
import {
  readBalanceParams,
  readFrame,
  readPaddings,
  readProcessingOptions,
  readRecolor,
  readThemeBackgroundLstar,
  TARGET,
} from "./targets";
import { createZip, safeBaseName, type ZipEntry } from "./zip";

type PackItem = { logo: ProcessedLogo; band: BoardBand; name: string };

async function buildPack(state: ToolcraftState): Promise<PackItem[]> {
  const values = state.values;
  const processing = readProcessingOptions(values);
  const logos: ProcessedLogo[] = [];
  const names: string[] = [];
  const ids: string[] = [];
  let index = 0;
  for (const asset of state.mediaAssets) {
    try {
      logos.push(await processLogo(asset.dataUrl, asset.mimeType, processing));
      names.push(safeBaseName(asset.fileName, `logo-${index + 1}`));
      ids.push(asset.id);
    } catch {
      // Skip assets that fail to decode.
    }
    index += 1;
  }
  const frame = readFrame(values, { forExport: true });
  const fillRatios = computeBoardFillRatios(
    logos,
    readBalanceParams(values, readThemeBackgroundLstar()),
  );
  const pack = computePackLayout(
    logos.map((logo) => logo.analysis),
    fillRatios,
    frame,
    readPaddings(values, ids),
  );
  return logos.map((logo, i) => ({ logo, band: pack.bands[i], name: names[i] }));
}

/** Background behind a single exported logo: the frame fill if enabled, otherwise transparent. */
function logoBackground(state: ToolcraftState): string | null {
  return readFrame(state.values, { forExport: true }).fill;
}

function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function uniqueNames(items: PackItem[], ext: string): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const count = seen.get(item.name) ?? 0;
    seen.set(item.name, count + 1);
    const suffix = count > 0 ? `-${count + 1}` : "";
    return `${item.name}${suffix}.${ext}`;
  });
}

/** Render one framed logo to its own PNG/JPG blob, sized to the frame × retina multiplier. */
async function renderLogoPng(
  state: ToolcraftState,
  item: PackItem,
  format: ImageFormat,
  multiplier: number,
  background: string | null,
  recolor: string | null,
): Promise<Uint8Array> {
  const { band, logo } = item;
  // Vector logos rasterize lazily; make sure a raster at export resolution exists before the
  // synchronous render below, or SVG sources would export at preview resolution.
  await logo.ensureSharpRaster(band.logoWidth, band.logoHeight, multiplier);
  const frameState: ToolcraftState = {
    ...state,
    canvas: { ...state.canvas, size: { width: band.bandWidth, height: band.bandHeight, unit: "px" } },
  };
  const canvas = createToolcraftPngExportCanvas({
    background: background ?? "#FFFFFF",
    includeBackground: background !== null,
    resolution: "current",
    devicePixelRatio: multiplier, // export.image.resolution -> retina multiplier
    state: frameState,
    render: ({ context }) => {
      drawLogoRecolored(
        context,
        logo,
        band.logoX - band.bandX,
        band.logoY - band.bandY,
        band.logoWidth,
        band.logoHeight,
        recolor,
      );
    },
  });
  return new Promise((resolve) => {
    canvas.toBlob(
      async (blob) => resolve(blob ? new Uint8Array(await blob.arrayBuffer()) : new Uint8Array()),
      imageMimeForFormat(format),
      format === "jpg" ? 0.95 : undefined,
    );
  });
}

export async function exportBoardPng(state: ToolcraftState): Promise<void> {
  const items = (await buildPack(state)).filter((item) => item.band && item.band.bandWidth > 0);
  if (items.length === 0) {
    return;
  }
  const format = normalizeImageFormat(state.values[TARGET.imageFormat]);
  const multiplier = imageMultiplier(state.values["export.image.resolution"]);
  const background = logoBackground(state);
  const recolor = readRecolor(state.values);
  const names = uniqueNames(items, format);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < items.length; i += 1) {
    entries.push({
      name: names[i],
      data: await renderLogoPng(state, items[i], format, multiplier, background, recolor),
    });
  }
  download(createZip(entries), "balanced-logos.zip");
}

export async function exportBoardSvg(state: ToolcraftState): Promise<void> {
  const items = (await buildPack(state)).filter((item) => item.band && item.band.bandWidth > 0);
  if (items.length === 0) {
    return;
  }
  const background = logoBackground(state);
  const recolor = readRecolor(state.values);
  const names = uniqueNames(items, "svg");
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = items.map((item, i) => ({
    name: names[i],
    data: encoder.encode(serializeFramedLogoSvg(item.logo, item.band, background, recolor)),
  }));
  download(createZip(entries), "balanced-logos-svg.zip");
}
