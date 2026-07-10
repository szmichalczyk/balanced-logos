# Balanced Logos

Drop a set of logos and get them optically balanced inside matching frames, ready to export — no manual eyeballing. Heavier marks are rendered smaller, lighter marks larger, so every logo in a row feels the same visual weight.

**Live app:** https://balanced-logos.vercel.app

## Features

- Drag-and-drop upload (SVG and raster logos)
- Optical weight balancing (ink coverage / density metrics, adjustable strength)
- Background knockout with tolerance control
- One-click recolor of the whole set
- Per-logo padding overrides
- Sharp vector rendering on canvas at any zoom level
- Export as PNG (1x/2x/4x) or true-vector SVG, packed into a ZIP

## Development

```bash
pnpm install
pnpm dev        # start dev server
pnpm test       # docs/integrity checks + unit tests
pnpm build      # typecheck + production build
```

## Licensing

This repository contains code under two regimes:

- **`src/toolcraft/`** — the [Toolcraft](https://pixel-point.com) runtime and UI components, owned by Pixel Point and governed by the [Toolcraft Designer License](LICENSE.md). Published here with Pixel Point's permission. See [NOTICE.md](NOTICE.md).
- **Everything else** (the balancing math, logo analysis, board layout, exporters, and app code) — © 2026 [@szmichalczyk](https://github.com/szmichalczyk).

This project was created with Toolcraft.
