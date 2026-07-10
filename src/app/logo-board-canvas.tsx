"use client";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { useToolcraft } from "@/toolcraft/runtime/react";
import { Slider } from "@/toolcraft/ui";

import { computeBoardFillRatios, computeBoardLayout, drawBoard, type BoardBand } from "./logo-board";
import { processLogo, type ProcessedLogo } from "./logo-analysis";
import {
  readBalanceParams,
  readFrame,
  readPaddingOverrides,
  readPaddings,
  readProcessingOptions,
  readRecolor,
  readThemeBackgroundLstar,
  TARGET,
} from "./targets";

// Canvas 2D can't parse color-mix()/currentColor; use a concrete mid-gray that reads on light and dark.
const FRAME_STROKE = "rgba(150, 150, 150, 0.6)";

type Entry = { logo: ProcessedLogo; id: string };

function processingKey(assetId: string, options: ReturnType<typeof readProcessingOptions>): string {
  // Key by the stable asset id plus what changes the processed pixels (knockout only — recolor is
  // applied at draw time, so changing colors never triggers reprocessing).
  return [assetId, options.removeBackground, options.tolerance].join("|");
}

export function LogoBoardCanvas(): React.JSX.Element {
  const { state, dispatch } = useToolcraft();
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const cacheRef = React.useRef<Map<string, ProcessedLogo>>(new Map());
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [selected, setSelected] = React.useState<{ id: string; x: number; y: number } | null>(null);
  // Bumped when a vector logo finishes re-rasterizing at a sharper resolution, to redraw with it.
  const [sharpVersion, setSharpVersion] = React.useState(0);

  const { values, canvas } = state;
  const hiddenLayerIds = new Set(
    state.layers.filter((layer) => layer.visible === false).map((layer) => layer.id),
  );
  const mediaAssets = React.useMemo(
    () => state.mediaAssets.filter((asset) => !hiddenLayerIds.has(asset.layerId)),
    [state.mediaAssets, state.layers],
  );
  const processing = readProcessingOptions(values);
  const processingSignature = mediaAssets
    .map((asset) => processingKey(asset.id, processing))
    .join("~");

  // Reprocess logos whenever the uploaded set or pixel-affecting options change.
  React.useEffect(() => {
    let cancelled = false;
    if (mediaAssets.length === 0) {
      setEntries([]);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const cache = cacheRef.current;
      // Process uncached logos in bounded-concurrency batches so a large upload (100+) stays fast.
      const CONCURRENCY = 16;
      const results = new Map<string, ProcessedLogo>();
      const uncached = mediaAssets.filter((asset) => !cache.has(processingKey(asset.id, processing)));
      for (let i = 0; i < uncached.length; i += CONCURRENCY) {
        if (cancelled) {
          return;
        }
        const batch = uncached.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (asset) => {
            try {
              const processed = await processLogo(asset.dataUrl, asset.mimeType, processing);
              cache.set(processingKey(asset.id, processing), processed);
              results.set(asset.id, processed);
            } catch {
              // Skip an asset that fails to decode; keep the rest.
            }
          }),
        );
      }
      if (cancelled) {
        return;
      }
      const next: Entry[] = [];
      for (const asset of mediaAssets) {
        const logo = cache.get(processingKey(asset.id, processing));
        if (logo) {
          next.push({ logo, id: asset.id });
        }
      }
      setEntries(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processingSignature]);

  // Size the preview board to ~80% of the free area between the side panels and above the toolbar,
  // centered in that gap. Recomputed on mount and window resize. Export stays content-sized.
  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const fit = (): void => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = (selector: string): DOMRect | undefined =>
        document.querySelector(selector)?.getBoundingClientRect();
      const infoCard = [...document.querySelectorAll("h1")]
        .find((h) => h.textContent?.includes("Balance your logos"))
        ?.closest("div")
        ?.getBoundingClientRect();
      const layers = rect('[data-panel-type="layers"]');
      const controls = rect('[data-panel-type="controls"]');
      const toolbar = rect('[data-panel-type="toolbar"]');
      const gap = 24;
      const leftEdge = Math.max(infoCard?.right ?? 0, layers?.right ?? 0, 0) + gap;
      const rightEdge = (controls?.left ?? vw) - gap;
      const topEdge = gap;
      const bottomEdge = (toolbar?.top ?? vh) - gap;
      const availW = Math.max(240, rightEdge - leftEdge);
      const availH = Math.max(240, bottomEdge - topEdge);
      const w = Math.round(availW * 0.8);
      const h = Math.round(availH * 0.9);
      dispatch({ type: "canvas.setSize", size: { width: w, height: h, unit: "px" } });
      dispatch({
        type: "canvas.setOffset",
        offset: {
          x: Math.round(leftEdge + availW / 2 - vw / 2),
          y: Math.round(topEdge + availH / 2 - vh / 2),
        },
      });
    };
    const raf = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
    };
  }, [dispatch]);

  const frame = readFrame(values);
  const balanceParams = readBalanceParams(values, readThemeBackgroundLstar());
  const recolor = readRecolor(values);
  const dpr = Math.min(2, (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1);
  // The canvas shell zooms with a CSS transform (a raster zoom), so the backing store must
  // follow zoom or everything — logos and the frame stroke — blurs when zoomed in. Capped so
  // extreme zoom on a large board cannot allocate an unbounded backing canvas.
  const MAX_BACKING_EDGE = 8192;
  const MAX_BACKING_AREA = 32 * 1024 * 1024;
  const zoomScale = (canvas.zoom ?? 100) / 100;
  const boardW = Math.max(1, canvas.size.width);
  const boardH = Math.max(1, canvas.size.height);
  const backingScale = Math.max(
    1,
    Math.min(
      dpr * zoomScale,
      MAX_BACKING_EDGE / Math.max(boardW, boardH),
      Math.sqrt(MAX_BACKING_AREA / (boardW * boardH)),
    ),
  );
  const overrides = readPaddingOverrides(values);

  const logos = entries.map((entry) => entry.logo);
  const ids = entries.map((entry) => entry.id);
  const paddings = readPaddings(values, ids);
  const fillRatios = computeBoardFillRatios(logos, balanceParams);
  const layout = computeBoardLayout(
    logos.map((logo) => logo.analysis),
    fillRatios,
    frame,
    canvas.size.width,
    canvas.size.height,
    paddings,
  );
  const layoutRef = React.useRef<{ bands: BoardBand[]; ids: string[] }>({ bands: [], ids: [] });
  layoutRef.current = { bands: layout.bands, ids };

  const drawSignature = [
    canvas.size.width,
    canvas.size.height,
    backingScale,
    frame.frameHeight,
    frame.paddingY,
    frame.fill ?? "none",
    frame.showBorder,
    recolor ?? "none",
    balanceParams.metric,
    balanceParams.strength,
    balanceParams.backgroundLstar,
    balanceParams.recolorLstar ?? "none",
    ids.join(","),
    JSON.stringify(paddings),
    sharpVersion,
  ].join("|");

  React.useEffect(() => {
    const canvasEl = canvasRef.current;
    const ctx = canvasEl?.getContext("2d");
    if (!canvasEl || !ctx) {
      return;
    }
    const width = canvas.size.width;
    const height = canvas.size.height;
    canvasEl.width = Math.max(1, Math.round(width * backingScale));
    canvasEl.height = Math.max(1, Math.round(height * backingScale));
    ctx.setTransform(backingScale, 0, 0, backingScale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawBoard(ctx, logos, { bands: layoutRef.current.bands, contentWidth: width, contentHeight: height }, {
      frame,
      frameStroke: FRAME_STROKE,
      recolor,
    });
    // Vector logos re-rasterize asynchronously at the current backing scale; when any comes back
    // sharper than what was just drawn, bump sharpVersion so this effect redraws with it.
    let stale = false;
    const bands = layoutRef.current.bands;
    void Promise.all(
      logos.map((logo, index) =>
        logo.ensureSharpRaster(
          bands[index]?.logoWidth ?? 0,
          bands[index]?.logoHeight ?? 0,
          backingScale,
        ),
      ),
    ).then((sharpened) => {
      if (!stale && sharpened.some(Boolean)) {
        setSharpVersion((version) => version + 1);
      }
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawSignature]);

  // Click a logo to open its per-logo padding editor, anchored at the click point.
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const x = ((event.clientX - rect.left) / rect.width) * canvas.size.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.size.height;
    const { bands, ids: bandIds } = layoutRef.current;
    const hitIndex = bands.findIndex(
      (b) => x >= b.bandX && x <= b.bandX + b.bandWidth && y >= b.bandY && y <= b.bandY + b.bandHeight,
    );
    setSelected(
      hitIndex >= 0 ? { id: bandIds[hitIndex], x: event.clientX, y: event.clientY } : null,
    );
  };

  const setPadding = (id: string, value: number): void => {
    dispatch({
      type: "controls.setValue",
      target: TARGET.paddingOverrides,
      value: { ...overrides, [id]: value },
    });
  };
  const resetPadding = (id: string): void => {
    const next = { ...overrides };
    delete next[id];
    dispatch({ type: "controls.setValue", target: TARGET.paddingOverrides, value: next });
  };

  const selectedValid = selected !== null && ids.includes(selected.id);
  const selectedPadding =
    selected && typeof overrides[selected.id] === "number" ? overrides[selected.id] : frame.paddingY;

  // Anchor the tooltip at the click point, clamped/flipped inside the viewport (it is portaled out
  // of the overflow-clipped canvas so it is never cut off at the board edges).
  const TOOLTIP_W = 224;
  const TOOLTIP_H = 118;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 720;
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const tipLeft = selected ? clamp(selected.x - TOOLTIP_W / 2, 8, vw - TOOLTIP_W - 8) : 0;
  const tipTop = selected
    ? selected.y + 16 + TOOLTIP_H > vh - 8
      ? clamp(selected.y - TOOLTIP_H - 16, 8, vh - TOOLTIP_H - 8)
      : selected.y + 16
    : 0;
  const portalTarget =
    typeof document !== "undefined"
      ? document.querySelector<HTMLElement>("[data-toolcraft-theme]") ?? document.body
      : null;

  return (
    <div className="relative" style={{ width: canvas.size.width, height: canvas.size.height }}>
      <canvas
        data-testid="logo-board"
        data-toolcraft-generated-output=""
        onClick={handleClick}
        // Stop the canvas shell from capturing the pointer for panning, so clicks reach the logo.
        onPointerDown={(event) => event.stopPropagation()}
        ref={canvasRef}
        style={{ display: "block", cursor: "pointer", width: canvas.size.width, height: canvas.size.height }}
      />

      {mediaAssets.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-xs leading-relaxed text-[color:var(--muted-foreground)]">
            Drag n drop your logos to get started
          </p>
        </div>
      ) : null}

      {selected && selectedValid && portalTarget
        ? ReactDOM.createPortal(
            <div
              className="fixed z-50 rounded-lg bg-[color:var(--card)] p-3 text-[color:var(--foreground)] shadow-lg ring-1 ring-[color:color-mix(in_oklab,var(--foreground)_12%,transparent)]"
              onPointerDown={(event) => event.stopPropagation()}
              style={{ left: tipLeft, top: tipTop, width: TOOLTIP_W }}
            >
              <Slider
                baseValue={frame.paddingY}
                max={48}
                min={0}
                name="Padding"
                onValueChange={(value) => setPadding(selected.id, value)}
                step={1}
                unit="px"
                value={Math.round(selectedPadding)}
              />
              <div className="mt-2.5 flex items-center justify-between">
                <button
                  className="text-2xs text-[color:var(--muted-foreground)] underline-offset-2 hover:underline"
                  onClick={() => resetPadding(selected.id)}
                  type="button"
                >
                  Reset to global
                </button>
                <button
                  className="text-2xs text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
                  onClick={() => setSelected(null)}
                  type="button"
                >
                  Done
                </button>
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </div>
  );
}
