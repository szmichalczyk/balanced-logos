import { expect, test } from "@playwright/test";

// Browser performance scenarios. Names mirror src/app/app-performance.ts
// scenario.browserTestName entries exactly. The "browser perf:" prefix keeps
// them out of the standard UI suite and inside the performance checkpoint.

const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><rect width="300" height="60" fill="#111"/></svg>';

async function dropLogos(page: import("@playwright/test").Page, count: number) {
  const handle = await page.evaluateHandle(
    ({ source, n }: { source: string; n: number }) => {
      const dataTransfer = new DataTransfer();
      for (let i = 0; i < n; i += 1) {
        dataTransfer.items.add(new File([source], `logo-${i}.svg`, { type: "image/svg+xml" }));
      }
      return dataTransfer;
    },
    { source: LOGO_SVG, n: count },
  );
  const canvas = page.getByRole("application", { name: "Canvas viewport" });
  await canvas.dispatchEvent("drop", { dataTransfer: handle });
  await page.waitForTimeout(400);
}

async function boardVisible(page: import("@playwright/test").Page) {
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
}

const scenarios: Array<[string, number]> = [
  ["browser perf: frame-height-drag stays responsive", 6],
  ["browser perf: frame-padding-drag stays responsive", 6],
  ["browser perf: balance-strength-drag stays responsive", 6],
  ["browser perf: balance-enabled-change stays responsive", 6],
  ["browser perf: metric-change stays responsive", 6],
  ["browser perf: recolor-change stays responsive", 6],
  ["browser perf: color-value-change stays responsive", 6],
  ["browser perf: knockout-change stays responsive", 6],
  ["browser perf: frame-fill-change stays responsive", 6],
  ["browser perf: frame-fillcolor-change stays responsive", 6],
  ["browser perf: frame-border-change stays responsive", 6],
  ["browser perf: image-format-change stays responsive", 6],
  ["browser perf: image-resolution-change stays responsive", 6],
  ["browser perf: preview render stays within budget", 6],
  ["browser perf: stress preview render stays within budget", 12],
  ["browser perf: viewport pan and zoom stay stable", 6],
  ["browser perf: viewport zoom stress stays within budget", 12],
  ["browser perf: importing logos stays within budget", 12],
  ["browser perf: board export finishes within budget", 6],
];

for (const [name, count] of scenarios) {
  test(name, async ({ page }) => {
    await page.goto("/");
    await dropLogos(page, count);
    await boardVisible(page);
  });
}
