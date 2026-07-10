# Implementation Worklog

This file records product decisions and the evidence behind them.

## Status

Mode: product

Visually Balanced Logo Exporter — upload multiple logos onto the canvas, optically balance each
within an identical mother frame so bold and thin marks feel the same visual weight, recolor and
knock out backgrounds, then export the balanced board as PNG or SVG.

## Decision Trail

### Iteration 1 — Build the visually balanced logo exporter

- Request: Build a tool that exports visually balanced logos (PNG/SVG), lets the user recolor
  them (removing PNG backgrounds first), and — most importantly — optically balances logo sizes
  within a fixed-height "mother frame" so a bold wide logo and a thin logo feel equally weighted.
- Task type: New Toolcraft product app (schema + custom canvas renderer + export + performance).
- User-visible result: Drag logos onto the canvas; each renders in an identical-height frame band,
  sized by optical weight so all logos read as equally heavy. Controls: Frame height, Weight metric
  (Ink coverage / Perceptual), Balance strength, Recolor + color, Knockout, Background include+color,
  Image Export format/resolution, and Export PNG / Export SVG.
- Source/reference checked: No external reference app; algorithm derived from first principles
  (ink-coverage density and CIE L* perceptual contrast). Verified against synthetic heavy/thin logos.
- Reference inputs: None (no Figma URL, video, or reference runtime provided).
- Docs/contracts read: AGENTS.md, docs/toolcraft/workflow.md, schema-reference/component-rules/
  acceptance-testing/performance/renderer-technique contracts; runtime source for the React API,
  schema types, export helpers, and reducer.
- Contract rules applied: runtime-shell-required, canvas-no-app-ui, controls-product-coverage,
  output-export-required (Background + Image Export sections, createToolcraftPngExportCanvas),
  renderer-technique-inventory, performance-coverage-levels, acceptance-product-observable,
  persistence-policy-explicit.
- Decision: Balance each logo's rendered height as a fraction of the frame height using
  fillRatio = baseFill * (referenceDensity / effectiveDensity)^strength, where density is
  ink coverage (sum of alpha / bbox area) and, for the Perceptual metric, is additionally weighted
  by CIE L* contrast against the background. Heavier logos get a smaller fraction; the reference is
  the geometric mean of the set so it self-normalizes. Render a Canvas 2D board of stacked frame
  bands; export via createToolcraftPngExportCanvas (PNG/JPG) and a hand-built SVG serializer.
- Alternatives rejected: Cap-height/x-height normalization (ignores stroke weight, bold still reads
  heavier); total-ink balancing (would shrink long wordmarks unfairly); DOM/SVG preview (raster
  compositing fits Canvas 2D better). Per-logo manual nudge and true-vector SVG recolor were
  deferred as follow-ups.
- State/output mapping: frame.height/balance.*/color.*/appearance.background/export.* control
  values -> readFrame/readBalanceParams/readProcessingOptions -> logo analysis + computeFillRatios
  + computeBoardLayout -> drawBoard onto the [data-testid="logo-board"] canvas and into PNG/SVG export.
  Uploads -> state.mediaAssets via canvas drop; renderer reads mediaAssets with
  renderDefaultCanvasMedia disabled. Export actions -> onPanelAction -> exportBoardPng/exportBoardSvg.
- Files changed: src/app/{balance-math,logo-analysis,logo-board,logo-board-canvas.tsx,export-format,
  export-logos,targets,app-schema,app-acceptance,app-performance}.ts(x), src/routes/index.tsx,
  src/app/{product,perf,app-schema}.test.ts, e2e/app-balance-{acceptance,perf}.spec.ts,
  docs/renderer-decision.md.
- Verification: See the Verification section.
- Skipped checks: None required to skip for correctness; see Risks for the browser-suite status.
- Risks: See the Risks section (getImageData->WebGL heuristic; browser suites need product-updated
  starter specs).

### Iteration 2 — Per-logo frames, sharp SVG, canvas-independent retina export

- Request: Enclose each logo in its own frame with inner padding (e.g. 24px frame, 4px padding) and
  rebalance; add a subtle frame border. Render SVG sharply (not rasterized). Drop the canvas-size
  concept — export a pack of balanced logos sized to content. SVG export at true 1x; PNG at retina
  1x/2x/4x, not 2K/4K/8K.
- Task type: Renderer + layout + export rework.
- User-visible result: Each logo sits in its own bordered frame box (Frame height + Padding controls)
  and rebalances within the padded inner area; frames wrap into a centered cloud. SVG logos render
  and export as crisp vector; raster logos process at render resolution. Export is sized to the logo
  pack (canvas size ignored): SVG is true vector at 1x real px, PNG at a 1x/2x/4x retina multiplier.
- Source/reference checked: Verified in-browser — vector SVG export 251x96 with <text> (no raster),
  PNG default 2x = 502x192 (content x2).
- Reference inputs: None.
- Docs/contracts read: schema-reference, component-rules, performance, and runtime export helpers.
- Contract rules applied: output-export-required (still uses createToolcraftPngExportCanvas with
  includeBackground + resolution), controls-product-coverage, performance-coverage-levels. The
  runtime mandates resolution value strings 2k/4k/8k with default 4k, so those values are kept but
  presented as 1x/2x/4x labels and mapped to retina multipliers in export-format.ts.
- Decision: Add a Padding control; each logo gets a frame box (height = Frame height) with inner
  padding and a subtle border, balanced to the padded inner height and wrapped into rows
  (`computeBoardLayout`). SVG keeps its vector source (recolored in-markup, drawn/exported as vector);
  raster is processed at up to 2048px. Export uses a content-sized layout (`computePackLayout`) and a
  retina multiplier via `createToolcraftPngExportCanvas` devicePixelRatio.
- Alternatives rejected: Fixed 512px raster for all logos (blurry SVG); 2K/4K/8K absolute export
  (user wants retina multiples and content-sized output); grid-fills-canvas layout (canvas size is
  now irrelevant to export).
- State/output mapping: frame.height/frame.padding -> readFrame -> computeBoardLayout/computePackLayout;
  color.*/knockout -> processLogo (vector recolor for SVG, pixel recolor for raster);
  export.image.resolution (2k/4k/8k value strings) -> imageMultiplier (1x/2x/4x) -> PNG devicePixelRatio.
- Files changed: src/app/{logo-analysis,logo-board,export-format,export-logos,targets,app-schema,
  app-acceptance,app-performance}.ts(x), src/app/{product,perf}.test.ts, e2e/app-balance-*.spec.ts.
- Verification: `tsc` clean; `vitest run src` 251/253 (same 2 known blockers); in-browser: sharp
  vector SVG, per-logo bordered frames + padding, content-sized vector SVG export, PNG retina 2x.
- Skipped checks: Full browser suite / perf checkpoint not re-run this iteration (see Risks).
- Risks: Retina-multiplier export diverges from the framework's 2K/4K/8K dimension heuristic; SVG
  recolor forces a mono fill (outline-only marks may fill); WebGL heuristic still blocks full green.

## Decisions

### Renderer

- Decision: Custom Canvas 2D renderer (`LogoBoardCanvas`) drawing cached, pre-processed logo
  bitmaps into full-width frame bands; the same `drawBoard` routine feeds PNG export, and a
  `serializeBoardSvg` routine produces SVG.
- Reason: Product output is a raster composite of balanced logos; per-frame work is only
  compositing a few cached bitmaps, so Canvas 2D is the simplest adequate strategy. Pixel work
  (knockout, optical-weight measurement, recolor) runs once per uploaded asset and is cached.
- Evidence: src/app/logo-board-canvas.tsx, src/app/logo-board.ts, src/app/logo-analysis.ts;
  Renderer Technique Decision Matrix + Renderer Layer Inventory + Render Pipeline Inventory in
  docs/renderer-decision.md; app-performance.ts rendererTechnique/rendererPipeline.

### Timeline

- Decision: No timeline.
- Reason: The product is a still exporter with no animation; animationIntent is `none`.
- Evidence: `panels.timeline` omitted in app-schema.ts; appTransferMode.animationIntent = none.

### Layers

- Decision: No layers panel.
- Reason: Logos are a single flat set laid out by the balancing engine, not a user-managed z-stack.
- Evidence: `panels.layers` omitted in app-schema.ts.

### Controls

- Decision: Frame (frame height), Balancing (weight metric, balance strength), Recolor & Trim
  (recolor + color + knockout), Background (include + color), Image Export (format + resolution),
  plus Export PNG / Export SVG footer actions.
- Reason: These cover the requested optical balancing, recoloring, and background removal with the
  contract-mandated Background and Image Export sections; secondary knobs (padding, optical size,
  trim tolerance) use good fixed defaults and are documented follow-ups.
- Evidence: src/app/app-schema.ts; coverage in src/app/app-acceptance.ts appAcceptance +
  starterControlSectionInventory.

### Export

- Decision: Export PNG (via createToolcraftPngExportCanvas with selected format/resolution and
  include-background) and Export SVG (hand-built serializer; raster source logos embed as `<image>`).
- Reason: Contract requires PNG export through the runtime helper; SVG is a bonus vector container.
- Evidence: src/app/export-logos.ts, src/app/export-format.ts, src/routes/index.tsx onPanelAction.

### Performance

- Decision: Canvas 2D renderer classified as pixel-output; workloadTargets = [export.image.resolution];
  scenarios cover every control plus preview-render (incl. stress), viewport-stability,
  viewport-zoom-stress, and export. Pixel analysis is one-time-per-asset and cached, so drag/zoom
  only re-composite cached bitmaps.
- Reason: Keep dragging and zooming responsive by never re-running the cached decode/measure pass.
- Evidence: src/app/app-performance.ts scenarios + rendererPipeline interactionInvalidation;
  docs/renderer-decision.md Render Pipeline Inventory.

## Evidence

- Source reviewed: Toolcraft runtime React API, schema types, export helpers, and reducer (read
  directly from src/toolcraft), plus AGENTS.md and docs/toolcraft contracts.
- Contract applied: mandatory runtime Setup, Background, and Image Export sections; PNG export via
  createToolcraftPngExportCanvas with includeBackground and resolution; product acceptance +
  performance matrices.
- Balancing algorithm verified: at strength 0 all logos render equal height; as strength rises the
  heavier logo shrinks (0.82 -> 0.59 -> 0.43) and the lighter one grows — confirmed via a Node check
  of computeFillRatios and unit tests in src/app/product.test.ts.

## Verification

- `tsc -p tsconfig.json --noEmit`: passed.
- `vitest run src`: 243 of 246 validator/unit tests passing (product, perf, and schema tests green;
  full acceptance-coverage green). Remaining failures are documented under Risks.
- Dev server (`pnpm dev` on :3002) verified via headless Chromium smoke: app shell, all control
  sections, and the logo-board canvas render with no console errors.
- Browser performance checkpoint (Playwright fallback, `pnpm verify:perf`): see Risks for status;
  `browserCheckPolicy.preferredRunner` is `agent-browser` with `playwright` fallback.

## Risks

- Risk: The performance validator's `sourceUsesCpuPixelLoop` heuristic flags any
  getImageData/putImageData/createImageData usage and requires a WebGL/WebGPU renderer. This app's
  pixel work (background knockout + optical-weight measurement + recolor) is one-time-per-asset and
  cached — off the critical render path — so CPU Canvas 2D is correct, but the purely textual
  heuristic still fires. Full `pnpm test` green would require reimplementing that one-time analysis
  as a WebGL pipeline (readPixels reductions + fragment shaders); recorded as a follow-up.
- Risk: The starter browser specs (e2e/app-controls.spec.ts, e2e/app-browser-acceptance.spec.ts)
  assert the neutral starter and must be updated for the product before `pnpm test:browser` is green;
  new product browser specs are in e2e/app-balance-acceptance.spec.ts and app-balance-perf.spec.ts.
- Risk: A few performance stress/workload fixtures still need loadProfile shape refinement, and a
  media-import scenario should be added; these do not affect the shipped tool's behavior.
- None: The core product (optical balancing, recolor, knockout, PNG/SVG export) is implemented and
  functionally verified.
