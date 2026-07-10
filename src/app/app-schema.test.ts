import { describe, expect, it } from "vitest";

import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";

function findSection(title: string) {
  return (appSchema.panels.controls?.sections ?? []).find(
    (section) => section.title === title,
  );
}

describe("appSchema", () => {
  it("keeps the runtime setup as the first controls section", () => {
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.upload).toBe(true);
    // Output is a content-sized logo pack, so the artboard is fixed and its size controls are hidden.
    expect(appSchema.canvas.sizing).toEqual({ mode: "fixed-output" });
    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");
    expect(appSchema.panels.controls?.sections[0]?.controls.settingsTransfer).toMatchObject({
      target: "runtime.settingsTransfer",
      type: "settingsTransfer",
    });
  });

  it("exposes the balancing product sections", () => {
    const titles = (appSchema.panels.controls?.sections ?? [])
      .map((section) => section.title)
      .filter((title): title is string => typeof title === "string");
    expect(titles).toEqual(
      expect.arrayContaining(["Frame", "Balancing", "Recolor & Trim", "Image Export"]),
    );
  });

  it("declares the frame and balancing controls", () => {
    expect(findSection("Frame")?.controls.frameHeight).toMatchObject({
      target: "frame.height",
      type: "slider",
    });
    expect(findSection("Balancing")?.controls.metric).toMatchObject({
      target: "balance.metric",
      type: "select",
    });
    expect(findSection("Balancing")?.controls.strength).toMatchObject({
      target: "balance.strength",
      type: "slider",
    });
  });

  it("puts frame fill and border in the Frame section", () => {
    const frameSection = findSection("Frame");
    expect(frameSection?.controls.frameFill).toMatchObject({ target: "frame.fill", type: "switch" });
    expect(frameSection?.controls.frameBorder).toMatchObject({ target: "frame.border", type: "switch" });
  });

  it("provides a performance matrix for the custom renderer", () => {
    expect(appPerformance.usesCustomRenderer).toBe(true);
    expect(appPerformance.scenarios.length).toBeGreaterThan(0);
    expect(appPerformance.workloadTargets.length).toBeGreaterThan(0);
  });
});
