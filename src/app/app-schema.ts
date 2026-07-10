import { defineToolcraft } from "@/toolcraft/runtime";

// Visually Balanced Logo Exporter.
// Upload logos onto the canvas; each is optically balanced (heavier logos rendered smaller)
// inside an identical frame band so every logo feels the same weight. Recolor + background
// trim, then export the balanced board as PNG or SVG.
export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    upload: true,
    draggable: true,
    // Output is a pack of balanced logos sized to their own content, so the artboard size is
    // irrelevant — use a fixed preview canvas and hide the Setup size/aspect/scale controls.
    renderScale: false,
    sizing: { mode: "fixed-output" },
    size: { width: 1280, height: 720, unit: "px" },
  },
  export: {
    png: { background: "include" },
  },
  toolbar: {
    history: true,
    radar: true,
    theme: true,
    zoom: true,
  },
  panels: {
    layers: true,
    controls: {
      title: "Controls",
      sections: [
        {
          title: "Frame",
          controls: {
            frameHeight: {
              type: "slider",
              target: "frame.height",
              label: "Frame height",
              description:
                "Height of the frame that encloses each logo, in canvas pixels. Logos are balanced to fit the padded inner area.",
              min: 16,
              max: 320,
              step: 2,
              unit: "px",
              defaultValue: 96,
              orderRole: "primary",
              performanceRole: "responsiveness",
            },
            framePadding: {
              type: "slider",
              target: "frame.padding",
              label: "Padding",
              description: "Inner padding between the frame edge and the logo, on every side.",
              min: 0,
              max: 48,
              step: 1,
              unit: "px",
              defaultValue: 12,
              orderRole: "primary",
              performanceRole: "responsiveness",
            },
            frameFill: {
              type: "switch",
              target: "frame.fill",
              label: "Fill",
              description: "Fill each logo's frame with a background color (exported with the logo).",
              defaultValue: false,
              orderRole: "primary",
              performanceRole: "responsiveness",
            },
            frameFillColor: {
              type: "color",
              target: "frame.fillColor",
              label: false,
              defaultValue: "#FFFFFF",
              orderRole: "color",
              performanceRole: "responsiveness",
            },
            frameBorder: {
              type: "switch",
              target: "frame.border",
              label: "Border",
              description: "Show a hairline border around each frame in the preview only; never exported.",
              defaultValue: true,
              orderRole: "detail",
              performanceRole: "responsiveness",
            },
          },
          layoutGroups: [
            { layout: "inline", columns: 2, controls: ["frameFill", "frameFillColor"] },
          ],
        },
        {
          title: "Balancing",
          controls: {
            balanceEnabled: {
              type: "switch",
              target: "balance.enabled",
              label: "Balance",
              description:
                "Toggle optical balancing off to preview the raw equal-height layout, on to rebalance.",
              defaultValue: true,
              orderRole: "mode",
              performanceRole: "responsiveness",
            },
            metric: {
              type: "select",
              target: "balance.metric",
              label: "Weight metric",
              description:
                "Ink coverage weighs stroke density; Perceptual also weighs contrast against the background.",
              defaultValue: "ink",
              orderRole: "mode",
              performanceRole: "responsiveness",
              options: [
                { label: "Ink coverage", value: "ink" },
                { label: "Perceptual", value: "perceptual" },
              ],
            },
            strength: {
              type: "slider",
              target: "balance.strength",
              label: "Balance strength",
              description:
                "How strongly heavier logos are shrunk toward equal optical weight. 0% keeps every logo at the same height.",
              min: 0,
              max: 100,
              step: 5,
              unit: "%",
              defaultValue: 50,
              orderRole: "strength",
              performanceRole: "responsiveness",
            },
          },
        },
        {
          title: "Recolor & Trim",
          controls: {
            recolor: {
              type: "switch",
              target: "color.recolor",
              label: "Recolor",
              defaultValue: false,
              orderRole: "primary",
              performanceRole: "responsiveness",
            },
            recolorValue: {
              type: "color",
              target: "color.value",
              label: false,
              defaultValue: "#111111",
              orderRole: "color",
              performanceRole: "responsiveness",
            },
            knockout: {
              type: "switch",
              target: "color.knockout",
              label: "Knockout",
              description:
                "Remove the solid background behind raster (PNG/JPG) logos before measuring and recoloring.",
              defaultValue: true,
              orderRole: "primary",
              performanceRole: "responsiveness",
            },
          },
          layoutGroups: [
            { layout: "inline", columns: 2, controls: ["recolor", "recolorValue"] },
          ],
        },
        {
          title: "Image Export",
          controls: {
            imageFormat: {
              type: "select",
              target: "export.image.format",
              label: "Format",
              defaultValue: "png",
              orderRole: "mode",
              performanceRole: "responsiveness",
              options: [
                { label: "PNG", value: "png" },
                { label: "JPG", value: "jpg" },
              ],
            },
            imageResolution: {
              type: "select",
              target: "export.image.resolution",
              label: "Scale",
              description:
                "PNG pixel density: 1x is true size, 2x/4x are retina. SVG always exports at true 1x.",
              // Runtime contract requires the value strings 2k/4k/8k with default 4k; we present them
              // as retina multipliers (1x/2x/4x) and map value -> multiplier in export-format.ts.
              defaultValue: "4k",
              orderRole: "mode",
              performanceRole: "workload",
              performanceReason:
                "Higher PNG scale (1x/2x/4x) multiplies the exported pixel dimensions.",
              options: [
                { label: "1x", value: "2k" },
                { label: "2x", value: "4k" },
                { label: "4x", value: "8k" },
              ],
            },
          },
          layoutGroups: [
            { layout: "inline", columns: 2, controls: ["imageFormat", "imageResolution"] },
          ],
        },
        {
          controls: {
            output: {
              type: "panelActions",
              target: "actions.output",
              label: false,
              actions: [
                {
                  value: "export.png",
                  label: "Export PNG",
                  icon: "upload-simple",
                  variant: "default",
                },
                {
                  value: "export.svg",
                  label: "Export SVG",
                  icon: "download-simple",
                  variant: "secondary",
                },
              ],
            },
          },
        },
      ],
    },
  },
});
