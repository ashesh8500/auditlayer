"""Generate self-contained ALM outlines; run with `uv run --with fonttools python`.

Approved reference: docs/ios/preview.html in alm-ios-20260919: 800 weight,
-1.2px tracking at 24px, #14241f ink, #0f766e period. Liberation Sans Bold
provides portable system-sans outlines (SIL OFL); no font is loaded at runtime.
Raster derivatives are rendered by scripts/verify-brand.mjs using Chromium.
"""
from pathlib import Path
import argparse
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument("--font", default="/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf")
args = p.parse_args()
font = TTFont(args.font)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = 24 / font['head'].unitsPerEm
x = 0
parts = []
for char in 'ALM.':
    glyph = glyphs[cmap[ord(char)]]
    pen = SVGPathPen(glyphs)
    glyph.draw(pen)
    parts.append(f'<path transform="translate({x:.4f} 24) scale({scale:.8f} {-scale:.8f})" d="{pen.getCommands()}" fill="' + ('DOT' if char == '.' else 'INK') + '"/>')
    x += glyph.width * scale - 1.2
width = round(x + 1.2, 4)
body = ''.join(parts)
def svg(ink, dot, icon=False):
    drawing = body.replace('INK', ink).replace('DOT', dot)
    if icon:
        drawing = '<rect width="64" height="64" rx="12" fill="#fffdf8"/><g transform="translate(5 17) scale(' + str(54 / width) + ')">' + drawing + '</g>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {64 if icon else width} {64 if icon else 30}" role="img" aria-label="AuditLayerMedia">{drawing}</svg>\n'
output = ROOT / 'web/public/brand'
output.mkdir(parents=True, exist_ok=True)
for name, ink, dot, icon in [('alm-wordmark.svg','#14241f','#0f766e',False),('alm-wordmark-inverse.svg','#fffdf8','#5ee0b5',False),('alm-icon.svg','#14241f','#0f766e',True)]:
    (output/name).write_text(svg(ink,dot,icon))
print(f'Generated 3 outlined SVGs; wordmark aspect ratio {width}:30')
