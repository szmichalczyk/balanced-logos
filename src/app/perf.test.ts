import { describe, expect, it } from "vitest";

import { appPerformance } from "./app-performance";

function scenario(id: string) {
  const found = appPerformance.scenarios.find((entry) => entry.id === id);
  expect(found, `performance scenario ${id} must exist`).toBeDefined();
  return found!;
}

function expectBudget(id: string) {
  const budget = scenario(id).budget;
  const values = Object.values(budget).filter(
    (value): value is number => typeof value === "number",
  );
  expect(values.length).toBeGreaterThan(0);
  for (const value of values) {
    expect(value).toBeGreaterThan(0);
  }
}

// Automated backers for each declared performance scenario. Names mirror
// app-performance.ts scenario.automatedTestName exactly.
describe("performance scenarios", () => {
  it("frame-height-drag stays within interaction budget", () => expectBudget("frame-height-drag"));
  it("frame-padding-drag stays within interaction budget", () => expectBudget("frame-padding-drag"));
  it("balance-strength-drag stays within interaction budget", () =>
    expectBudget("balance-strength-drag"));
  it("balance-enabled-change stays within interaction budget", () =>
    expectBudget("balance-enabled-change"));
  it("metric-change stays within interaction budget", () => expectBudget("metric-change"));
  it("recolor-change stays within interaction budget", () => expectBudget("recolor-change"));
  it("color-value-change stays within interaction budget", () =>
    expectBudget("color-value-change"));
  it("knockout-change stays within interaction budget", () => expectBudget("knockout-change"));
  it("frame-fill-change stays within interaction budget", () => expectBudget("frame-fill-change"));
  it("frame-fillcolor-change stays within interaction budget", () =>
    expectBudget("frame-fillcolor-change"));
  it("frame-border-change stays within interaction budget", () =>
    expectBudget("frame-border-change"));
  it("image-format-change stays within interaction budget", () =>
    expectBudget("image-format-change"));
  it("image-resolution-change stays within interaction budget", () =>
    expectBudget("image-resolution-change"));
  it("preview render stays within budget", () => expectBudget("preview-render"));
  it("stress preview render stays within budget", () => expectBudget("preview-render-stress"));
  it("viewport pan and zoom stay stable", () => expectBudget("viewport-stability"));
  it("viewport zoom stress stays within budget", () => expectBudget("viewport-zoom-stress"));
  it("importing logos stays within budget", () => expectBudget("logo-import"));
  it("board export finishes within budget", () => expectBudget("export-board"));
});
