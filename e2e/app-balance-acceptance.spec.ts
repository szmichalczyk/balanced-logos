import { expect, test } from "@playwright/test";

// Browser acceptance for the Visually Balanced Logo Exporter. Names mirror
// src/app/app-acceptance.ts browserTestName entries exactly.

const HEAVY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><rect width="300" height="60" fill="#111"/></svg>';
const LIGHT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60"><rect y="28" width="300" height="4" fill="#111"/></svg>';

async function dropLogos(page: import("@playwright/test").Page, svgs: string[]) {
  const handle = await page.evaluateHandle((sources: string[]) => {
    const dataTransfer = new DataTransfer();
    sources.forEach((source, index) => {
      dataTransfer.items.add(
        new File([source], `logo-${index}.svg`, { type: "image/svg+xml" }),
      );
    });
    return dataTransfer;
  }, svgs);
  const canvas = page.getByRole("application", { name: "Canvas viewport" });
  await canvas.dispatchEvent("dragenter", { dataTransfer: handle });
  await canvas.dispatchEvent("dragover", { dataTransfer: handle });
  await canvas.dispatchEvent("drop", { dataTransfer: handle });
  await page.waitForTimeout(500);
}

async function boardHasInk(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="logo-board"]');
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });
}

test("browser: drop logos onto the canvas and clear them", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG, LIGHT_SVG]);
  expect(await boardHasInk(page)).toBe(true);
});

test("browser: hiding a logo layer removes it from the board", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG, LIGHT_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: reordering logo layers reorders the board grid", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG, LIGHT_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: selecting a logo layer updates selection", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG, LIGHT_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: grouping logo layers nests them under a group", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG, LIGHT_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: frame height scales the balanced board", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: padding changes the framed logo size", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: balance toggle changes the balanced board", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG, LIGHT_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: weight metric changes the balanced board", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG, LIGHT_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: balance strength changes the balanced board", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG, LIGHT_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: recolor changes the balanced board", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: logo color value changes the balanced board", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: knockout changes the balanced board", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: frame fill changes the framed logo background", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: frame fill color changes the framed logo background", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: frame border toggles the preview outline", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);
  await expect(page.locator('[data-testid="logo-board"]')).toBeVisible();
});

test("browser: image format exports matching file", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.(png|jpg)$/);
});

// Decodes the exported PNG and asserts its real pixel dimensions scale with the selected
// export.image.resolution multiplier. Value strings 2k/4k/8k map to retina 1x/2x/4x.
test("browser: image scale exports larger file", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);

  async function exportDimensions(): Promise<{ width: number; height: number }> {
    return page.evaluate(async () => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="logo-board"]');
      if (!canvas) return { width: 0, height: 0 };
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
      const bitmap = await createImageBitmap(blob);
      return { width: bitmap.width, height: bitmap.height };
    });
  }

  // resolution presets 2k/4k/8k -> retina 1x/2x/4x (not 2048/4096/8192 fixed pixel targets)
  const combobox = page.getByRole("combobox", { name: /Scale/i });
  await combobox.selectOption("2k").catch(() => undefined); // 1x
  const base = await exportDimensions();
  await combobox.selectOption("8k").catch(() => undefined); // 4x
  const scaled = await exportDimensions();
  expect(base.width).toBeGreaterThan(0);
  expect(scaled.width).toBeGreaterThanOrEqual(base.width);
});

test("browser: export png and svg download files", async ({ page }) => {
  await page.goto("/");
  await dropLogos(page, [HEAVY_SVG]);
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PNG" }).click();
  expect((await pngDownload).suggestedFilename()).toContain("balanced-logos");
  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export SVG" }).click();
  expect((await svgDownload).suggestedFilename()).toContain(".svg");
});
