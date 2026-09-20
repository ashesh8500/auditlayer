# AuditLayerMedia wordmark

The approved reference is `alm-ios-20260919/docs/ios/preview.html`: `.wordmark` uses 24px system sans, weight 800, -1.2px tracking, #14241f dark ink and #0f766e green period. These portable outlines use Liberation Sans Bold to preserve the system-sans treatment without loading a font. They are not claimed to be pixel-identical to Apple's proprietary system font.

- `alm-wordmark.svg`: default dark ALM + green period, transparent background.
- `alm-wordmark-inverse.svg`: #fffdf8 ALM + #5ee0b5 period on dark backgrounds.
- `alm-icon.svg`: same glyphs on an opaque #fffdf8 tile for browser and home-screen icons. Do not reverse a favicon based on the browser's color scheme.
- `alm-favicon.svg` / `alm-favicon-16.png`: deliberately pixel-hinted 16px ALM. derivative. Native-sized QA found the unhinted mark lost its period; this preserves all three letters and a two-pixel green period. Only the 16px ICO entry uses it; larger entries retain the outlined typography.
- `alm-mark.png`: regenerated compatibility alias of the new square icon; no active component references this legacy path.

Canonical generator: `scripts/generate-brand-assets.py` (from repository root: `uv run --with fonttools python scripts/generate-brand-assets.py`). Font input can be selected explicitly with `--font`; no runtime font dependency. Glyph source: Liberation Sans Bold, digitized data copyright 2010 Google Corporation; copyright 2012 Red Hat, Inc., SIL Open Font License 1.1. The assets are rendered logo artwork, not redistributed fonts.

`web/scripts/verify-brand.mjs` renders the real Brand component with actual compiled Tailwind CSS, verifies responsive geometry, and regenerates the PNG derivatives / OG image. Run from `web/`: `node scripts/verify-brand.mjs`. The worker shell embeds the same SVG paths for offline HTML/PDF fidelity; `worker/tests/test_brand_surface.py` checks equality, so refresh both shell occurrences if outlines change.

Emails intentionally use inline-styled live text (the same system stack, spacing and colors), not SVG/image dependencies: SVG is not consistently supported in mail clients and external images can be blocked. Native mail-client font substitution is expected.
