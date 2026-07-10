import {
  defineToolcraftPerformance,
  type ToolcraftPerformanceConfig,
  type ToolcraftPerformanceScenario,
} from "@/toolcraft/runtime";

// The preview draws cached, pre-processed logo bitmaps (drawImage) plus a few frame strokes:
// that is simple-composition. The expensive pixel work (decode, background knockout, weight
// measurement, recolor) runs once per uploaded asset off the render path and is cached, so it
// only re-runs on media import or a color/knockout change — never per preview frame.

function controlScenario(
  overrides: Partial<ToolcraftPerformanceScenario> &
    Pick<ToolcraftPerformanceScenario, "id" | "target" | "interaction" | "controlLabel">,
): ToolcraftPerformanceScenario {
  return {
    automated: true,
    automatedTestName: `${overrides.id} stays within interaction budget`,
    browser: true,
    browserTestName: `browser perf: ${overrides.id} stays responsive`,
    budget: { maxInteractionMs: 200, maxFrameGapMs: 100 },
    expectedObservable: "The balanced board preview updates without a dropped-frame stall.",
    fixture: "Six logos of varied weight uploaded onto the board.",
    workload: false,
    ...overrides,
  };
}

export const appPerformance: ToolcraftPerformanceConfig = defineToolcraftPerformance({
  browserCheckPolicy: {
    fallbackRunner: "playwright",
    fallbackWhen: ["agent-browser-unavailable", "ci"],
    preferredRunner: "agent-browser",
  },
  rendererStrategy: "canvas-2d",
  rendererWorkload: "pixel-output",
  usesCustomRenderer: true,
  rendererTechnique: {
    rendererStrategy: "canvas-2d",
    rendererWorkload: "pixel-output",
    sourceRepresentation: "image-media",
    productRepresentation: "pixel",
    previewRenderer: "canvas-2d",
    exportRenderer: "canvas-2d",
    whyNotAlternativeStrategies: [
      "Per-frame preview work is only compositing a few cached bitmaps and thin frame strokes; DOM/SVG add layout cost without benefit. The pixel work (getImageData knockout + optical-weight measurement + recolor) runs once per uploaded asset and is cached, so there is no per-frame pixel loop for WebGL/WebGPU to accelerate.",
    ],
    fidelityRisks: [
      "SVG export of raster (PNG/JPG) source logos embeds the processed bitmap rather than true vector paths.",
    ],
    performanceRisks: [
      "Decoding and measuring very large uploaded images is the main cost; it is bounded by capping the analysis raster to 512px on the long edge and caching per asset.",
    ],
    measuredAlternativeEvidence: [
      {
        alternativeStrategy: "webgl",
        scenarioId: "preview-render-stress",
        fixture: "Twelve 1920x1080 logos knocked out, recolored, and composited on a 1000x1000 board.",
        measuredResult:
          "One-time per-asset CPU decode+measure at the 512px analysis cap stays well under the preview budget; per-frame composition is only cached drawImage calls. A WebGL path would add context/upload overhead for one-time cached work with no per-frame pixel loop to accelerate.",
        decision:
          "Keep canvas-2d: pixel work is one-time and cached, so CPU is the simpler, adequately fast choice.",
      },
    ],
    layers: [
      {
        id: "board-logos",
        kind: "product-foreground",
        content: ["bitmap-media", "composite"],
        primitiveCount: "low",
        renderer: "canvas-2d",
        exportMode: "included",
        uiSelector: '[data-testid="logo-board"]',
      },
    ],
  },
  rendererPipeline: {
    passes: [
      {
        id: "decode-measure",
        kind: "preprocess",
        inputs: ["mediaAssets", "color.knockout", "color.value"],
        output: "source",
        quality: "preview",
        runsOn: "main",
        cacheKey: ["asset.id", "color.knockout", "color.value", "color.recolor"],
        invalidatedBy: ["media-import", "control-change"],
      },
      {
        id: "compose-board",
        kind: "composite",
        inputs: ["decode-measure", "frame.height", "balance.metric", "balance.strength"],
        output: "preview",
        quality: "preview",
        runsOn: "main",
        cacheKey: ["asset.id", "frame.height", "balance.metric", "balance.strength", "appearance.background"],
        invalidatedBy: ["control-change", "control-drag", "viewport-zoom", "viewport-drag"],
      },
      {
        id: "export-board",
        kind: "export",
        inputs: ["compose-board", "export.image.resolution", "appearance.background"],
        output: "export",
        quality: "export",
        runsOn: "export-only",
        invalidatedBy: ["export"],
      },
    ],
    interactionInvalidation: [
      {
        interaction: "media-import",
        targets: ["mediaAssets"],
        invalidates: ["decode-measure", "compose-board"],
      },
      {
        interaction: "control-change",
        targets: ["color.knockout", "color.value", "color.recolor", "balance.metric"],
        invalidates: ["decode-measure", "compose-board"],
      },
      {
        interaction: "control-drag",
        targets: ["frame.height", "balance.strength"],
        invalidates: ["compose-board"],
        mustNotInvalidate: ["decode-measure"],
      },
      {
        interaction: "viewport-zoom",
        targets: ["canvas.zoom"],
        invalidates: ["compose-board"],
        mustNotInvalidate: ["decode-measure"],
      },
      {
        interaction: "viewport-drag",
        targets: ["canvas.offset"],
        invalidates: ["compose-board"],
        mustNotInvalidate: ["decode-measure"],
      },
      {
        interaction: "export",
        targets: ["export.image.resolution", "export.image.format"],
        invalidates: ["export-board"],
      },
    ],
  },
  workloadTargets: ["export.image.resolution"],
  scenarios: [
    controlScenario({
      id: "frame-height-drag",
      target: "frame.height",
      interaction: "control-drag",
      controlLabel: "Frame height",
      expectedObservable: "Logo frame bands resize live on the canvas while dragging.",
    }),
    controlScenario({
      id: "frame-padding-drag",
      target: "frame.padding",
      interaction: "control-drag",
      controlLabel: "Padding",
      expectedObservable: "Logos shrink inside their fixed-height frames live while dragging padding.",
    }),
    controlScenario({
      id: "balance-strength-drag",
      target: "balance.strength",
      interaction: "control-drag",
      controlLabel: "Balance strength",
      expectedObservable: "Logo sizes rebalance live on the canvas while dragging.",
    }),
    controlScenario({
      id: "balance-enabled-change",
      target: "balance.enabled",
      interaction: "control-change",
      controlLabel: "Balance",
    }),
    controlScenario({
      id: "metric-change",
      target: "balance.metric",
      interaction: "control-change",
      controlLabel: "Weight metric",
    }),
    controlScenario({
      id: "recolor-change",
      target: "color.recolor",
      interaction: "control-change",
      controlLabel: "Recolor",
    }),
    controlScenario({
      id: "color-value-change",
      target: "color.value",
      interaction: "control-change",
      controlLabel: "Logo color",
    }),
    controlScenario({
      id: "knockout-change",
      target: "color.knockout",
      interaction: "control-change",
      controlLabel: "Knockout",
    }),
    controlScenario({
      id: "frame-fill-change",
      target: "frame.fill",
      interaction: "control-change",
      controlLabel: "Fill",
    }),
    controlScenario({
      id: "frame-fillcolor-change",
      target: "frame.fillColor",
      interaction: "control-change",
      controlLabel: "Fill color",
    }),
    controlScenario({
      id: "frame-border-change",
      target: "frame.border",
      interaction: "control-change",
      controlLabel: "Border",
    }),
    controlScenario({
      id: "image-format-change",
      target: "export.image.format",
      interaction: "control-change",
      controlLabel: "Format",
    }),
    controlScenario({
      id: "image-resolution-change",
      target: "export.image.resolution",
      interaction: "control-change",
      controlLabel: "Scale",
      workload: true,
      values: { default: "4k", min: "2k", max: "8k" },
      expectedObservable: "Exported PNG pixel dimensions scale with the chosen retina multiplier (1x/2x/4x).",
      stressFixture: {
        kind: "max-value",
        value: "8k",
        reason: "8k value string is the 4x multiplier — the heaviest export.",
        loadProfile: {
          metric: "custom",
          target: "export.image.resolution",
          hardLimit: "8k",
          smoothTarget: "8k",
          smoothTargetRatio: 1,
          userFacingRange: "fully-guaranteed",
        },
      },
      workloadFixture: {
        kind: "media",
        value: { width: 1920, height: 1080, count: 12 },
        reason: "Twelve 1920x1080 source logos are the heavy board baseline the export runs against.",
        loadProfile: {
          metric: "media-area",
          target: "mediaAssets",
          hardLimit: { width: 1920, height: 1080, count: 12 },
          smoothTarget: { width: 1920, height: 1080, count: 12 },
          smoothTargetRatio: 1,
          userFacingRange: "fully-guaranteed",
        },
      },
    }),
    {
      id: "preview-render",
      interaction: "preview-render",
      automated: true,
      automatedTestName: "preview render stays within budget",
      browser: true,
      browserTestName: "browser perf: preview render stays within budget",
      budget: { maxPreviewMs: 400, maxRenderMs: 400 },
      fixture: "Six logos of varied weight uploaded onto the board.",
      expectedObservable: "The full balanced board repaints within the preview budget.",
      workload: false,
    },
    {
      id: "preview-render-stress",
      interaction: "preview-render",
      stress: true,
      automated: true,
      automatedTestName: "stress preview render stays within budget",
      browser: true,
      browserTestName: "browser perf: stress preview render stays within budget",
      budget: { maxPreviewMs: 1200, maxRenderMs: 1200, maxLongTaskMs: 200 },
      fixture: "Twelve 1920x1080 logos knocked out and recolored on a 1000x1000 board.",
      expectedObservable:
        "The heaviest board (largest canvas, many high-resolution logos) repaints without a long main-thread task stall.",
      workload: false,
      stressFixture: {
        kind: "media",
        value: { width: 1920, height: 1080, count: 12 },
        reason: "Largest realistic source logos and board force the heaviest one-time pixel processing.",
        loadProfile: {
          metric: "media-area",
          target: "mediaAssets",
          hardLimit: { width: 1920, height: 1080, count: 12 },
          smoothTarget: { width: 1920, height: 1080, count: 12 },
          smoothTargetRatio: 1,
          userFacingRange: "fully-guaranteed",
        },
      },
    },
    {
      id: "viewport-zoom-stress",
      interaction: "viewport-zoom-stress",
      stress: true,
      automated: true,
      automatedTestName: "viewport zoom stress stays within budget",
      browser: true,
      browserTestName: "browser perf: viewport zoom stress stays within budget",
      budget: { maxInteractionMs: 400, maxFrameGapMs: 100, maxLongTaskMs: 200 },
      fixture: "Twelve 1920x1080 logos on a 1000x1000 board; user zooms the canvas rapidly.",
      expectedObservable:
        "Rapid zooming re-composites the cached board without recomputing the pixel analysis or stalling the main thread.",
      workload: false,
      stressFixture: {
        kind: "media",
        value: { width: 1920, height: 1080, count: 12 },
        reason: "Zooming the heaviest board must stay smooth by only re-compositing cached bitmaps.",
        loadProfile: {
          metric: "media-area",
          target: "mediaAssets",
          hardLimit: { width: 1920, height: 1080, count: 12 },
          smoothTarget: { width: 1920, height: 1080, count: 12 },
          smoothTargetRatio: 1,
          userFacingRange: "fully-guaranteed",
        },
      },
    },
    {
      id: "logo-import",
      interaction: "media-import",
      automated: true,
      automatedTestName: "importing logos stays within budget",
      browser: true,
      browserTestName: "browser perf: importing logos stays within budget",
      budget: { maxInteractionMs: 800, maxFrameGapMs: 120 },
      fixture: "User drops twelve 1920x1080 logos onto the canvas.",
      expectedObservable:
        "Importing logos decodes, knocks out, measures, and composites them within the interaction budget.",
      workload: true,
      stressFixture: {
        kind: "media",
        value: { width: 1920, height: 1080, count: 12 },
        reason: "Twelve full-HD source logos are the heaviest realistic import.",
        loadProfile: {
          metric: "media-area",
          target: "mediaAssets",
          hardLimit: { width: 1920, height: 1080, count: 12 },
          smoothTarget: { width: 1920, height: 1080, count: 12 },
          smoothTargetRatio: 1,
          userFacingRange: "fully-guaranteed",
        },
      },
    },
    {
      id: "viewport-stability",
      interaction: "viewport-stability",
      target: "layers.interactions",
      automated: true,
      automatedTestName: "viewport pan and zoom stay stable",
      browser: true,
      browserTestName: "browser perf: viewport pan and zoom stay stable",
      budget: { maxFrameGapMs: 100 },
      fixture:
        "Six logos on separate layers; user pans/zooms and uses layer selection, visibility, reorder, and grouping while watching selected-layer output.",
      expectedObservable:
        "Panning, zooming/radar, and layer selection/visibility/reorder/grouping keep the board and selected-layer output stable without frame gaps.",
      workload: false,
    },
    {
      id: "export-board",
      interaction: "export-copy",
      automated: true,
      automatedTestName: "board export finishes within budget",
      browser: true,
      browserTestName: "browser perf: board export finishes within budget",
      budget: { maxExportMs: 6000 },
      fixture: "Six logos uploaded; user exports an 8K PNG.",
      expectedObservable: "Exporting the balanced board completes within the export budget.",
      workload: false,
    },
  ],
});
