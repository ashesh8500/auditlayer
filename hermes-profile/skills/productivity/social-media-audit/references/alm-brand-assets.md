# ALM Brand Assets

Reference for AuditLayerMedia logo generation and brand mark usage.

## Preferred Mark

**"ALM"** — the three-letter acronym is the primary mark. Do not generate full "AuditLayerMedia" wordmarks or icon+wordmark lockups unless explicitly asked. The acronym is clean, recognizable, and already used in the report footer badge.

## Approved Typeface

**Humane** by Rajesh Rajput — a compressed, narrow, geometric sans-serif display typeface. Free for commercial use.

- Behance: https://www.behance.net/gallery/146747487/HUMANE-Free-Typeface-Variable
- File: `assets/HUMANE Typeface.zip` (extracted to repo `assets/`)
- Weight for logo: **Bold** (Humane-Bold.otf or Humane-Bold.ttf)
- Characteristics: super tall, super narrow, geometric, squared terminals, no contrast

## Color Spec

| Element | Color | Hex |
|---|---|---|
| Mark text | Teal accent | `#0d9488` |
| Background | Off-white | `#fafaf9` |
| Alternate bg | Pure white | `#ffffff` |

Single flat color, no gradients, no shadows, no effects. Flat vector aesthetic.

## Logo Dimensions

- **Canvas:** 1024×1024 px (square)
- **Upload spec:** 512–1024 px, PNG/JPG/GIF, under 5 MB
- **Letter-spacing:** 120px between characters at 750pt font size (Humane is extremely compressed — spacing keeps it confident and airy)

## Rendering Method

**Always use PIL/Pillow with the actual font file** for logo generation, never AI image generation. The font is available on disk — use it. AI image generators produce approximations that drift from the approved typeface.

```python
from PIL import Image, ImageDraw, ImageFont

font = ImageFont.truetype("path/to/Humane-Bold.otf", size=750)
img = Image.new("RGB", (1024, 1024), (250, 250, 249))  # #fafaf9
draw = ImageDraw.Draw(img)
# Render "ALM" with 120px letter-spacing, centered, in #0d9488
```

## File Locations

| File | Path |
|---|---|
| Font archive | `assets/HUMANE Typeface.zip` |
| Logo PNG | `assets/alm-logo-humane.png` (20 KB) |
| Logo JPEG | `assets/alm-logo-humane.jpg` (46 KB) |
| Previous gen (AI) | `assets/alm-logo.png`, `assets/alm-logo.jpg` — superseded |

## Usage in Reports

The report footer badge uses the `.alm-badge` CSS class with black background (`#1c1917`) and white text — this is the legacy text-only badge. For new reports, the standalone ALM mark in Humane can be used as an `<img>` in the brand ribbon or header when a visual logo is preferred over the text badge.

The Humane "ALM" rendering and the footer text badge serve different contexts — the Humane mark is for headers/ribbons/profile pictures; the `.alm-badge` text class stays for inline footer use.
