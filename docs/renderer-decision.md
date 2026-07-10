# Renderer Decision — Visually Balanced Logo Exporter

## Renderer Technique Decision Matrix

| Field | Choice |
| --- | --- |
| sourceRepresentation | image-media (uploaded PNG/JPG/SVG logos) |
| productRepresentation | pixel (composited raster board) |
| previewRenderer | canvas-2d |
| exportRenderer | canvas-2d (PNG/JPG) + hand-built SVG serializer |
| rendererStrategy | canvas-2d |
| rendererWorkload | pixel-output |

- **whyNotAlternativeStrategies**: Per-frame preview work is only compositing a handful of
  cached, pre-processed logo bitmaps plus thin frame strokes. DOM/SVG previews would add layout
  cost with no benefit for raster compositing. WebGL/WebGPU add context and upload overhead with
  no per-frame pixel loop to accelerate, because the expensive pixel work runs once per uploaded
  asset and is cached.
- **fidelityRisks**: SVG export of raster (PNG/JPG) source logos embeds the processed bitmap as an
  `<image>` rather than emitting true vector paths.
- **performanceRisks**: Decoding and measuring very large uploaded images is the dominant cost; it
  is bounded by capping the analysis raster at 512px on the long edge and caching per asset.

## Rejected renderer alternatives

We compared the chosen canvas-2d strategy against alternative strategies for both preview and
export/copy behavior and product-quality output:

- **text-output**: not applicable; there is no live text product.
- **vector-output** (DOM/SVG rendererWorkload): rejected for preview because logos are raster
  composites; SVG remains only as an export serializer.
- **pixel-output on WebGL/WebGPU**: rejected because the pixel work (knockout + optical-weight
  measurement + recolor) is one-time-per-asset and cached, so a GPU exportRenderer/preview pipeline
  would not improve product-quality export or per-frame responsiveness.

## Renderer Layer Inventory

| Layer id | kind | content | primitiveCount | renderer | exportMode |
| --- | --- | --- | --- | --- | --- |
| board-logos | product-foreground | bitmap-media, composite | low | canvas-2d | included |

There is no dense raster background layer; the semantic foreground (the balanced logos) is the
only product layer, mirrored in `app-performance.ts` `rendererTechnique.layers`.

## Render Pipeline Inventory

| Pass id | kind | runsOn | quality | cacheKey | invalidatedBy |
| --- | --- | --- | --- | --- | --- |
| decode-measure | preprocess | main | preview | asset id + knockout + color | media-import, control-change |
| compose-board | composite | main | preview | asset id + frame + balance + background | control-change, control-drag, viewport-zoom, viewport-drag |
| export-board | export | export-only | export | — | export |

Interaction invalidation rules:

- **media-import** invalidates decode-measure and compose-board (new source pixels).
- **control-change** on knockout / color / recolor / metric invalidates decode-measure + compose-board.
- **control-drag** on frame height / balance strength invalidates only compose-board and must not
  re-run the cached decode-measure pass, so dragging stays responsive.
- **viewport-zoom** and **viewport-drag** never invalidate expensive passes; the cached board is
  re-composited only.
- **export** invalidates the export-only pass.
