"""Build the Stacks logo package (Index palette) as outlined SVGs.

Usage: python build_logo.py <SpaceGrotesk[wght].ttf> <out_dir>

Needs fontTools (pip install fonttools). The font is Space Grotesk's variable TTF from
github.com/google/fonts (ofl/spacegrotesk); the script instances it at weight 700 and
outlines the wordmark, so the SVGs need no installed font. Render PNGs from the SVGs
with any SVG renderer (ImageMagick was used: magick -background none -density 300 in.svg out.png).
"""
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONT, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

C = {
    "ink": "#0F1419", "paper": "#F4F5F7", "white": "#FFFFFF",
    "signal": "#FF5A1F", "slate": "#5A6472", "slate_dk": "#8B95A3",
    "surface_dk": "#141920", "bg_dk": "#0B0E12",
}
# Three-tone mark per background, and the wordmark colour.
SCHEMES = {
    "light": dict(bars=(C["ink"], C["signal"], C["slate"]), word=C["ink"]),
    "dark": dict(bars=(C["paper"], C["signal"], C["slate_dk"]), word=C["paper"]),
    "mono-ink": dict(bars=(C["ink"],) * 3, word=C["ink"]),
    "mono-white": dict(bars=(C["white"],) * 3, word=C["white"]),
}

# Mark geometry, traced from the promo video: equal bars, offsets 0 / 22 / 10.
BAR_W, BAR_H, GAP, R = 100, 26, 8, 7
OFFS = (0, 22, 10)
MARK_W = BAR_W + max(OFFS)
MARK_H = 3 * BAR_H + 2 * GAP


def bars(x, y, s, colors):
    out = []
    for i, (off, col) in enumerate(zip(OFFS, colors)):
        out.append(
            f'<rect x="{x + off * s:.2f}" y="{y + i * (BAR_H + GAP) * s:.2f}" '
            f'width="{BAR_W * s:.2f}" height="{BAR_H * s:.2f}" rx="{R * s:.2f}" fill="{col}"/>'
        )
    return "".join(out)


font = instantiateVariableFont(TTFont(FONT), {"wght": 700})
gs, cmap = font.getGlyphSet(), font.getBestCmap()
UPM = font["head"].unitsPerEm
CAP = font["OS/2"].sCapHeight


def text_path(text, size, tracking_em=-0.02):
    """Outline text at `size` px; returns (path d, width, cap height px). Baseline at y=0."""
    pen = SVGPathPen(gs)
    scale = size / UPM
    x = 0.0
    for ch in text:
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (scale, 0, 0, -scale, x, 0))
        gs[g].draw(tp)
        x += gs[g].width * scale + tracking_em * size
    x -= tracking_em * size
    return pen.getCommands(), x, CAP * scale


def svg(w, h, body, bg=None, title="Stacks"):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{rect}{body}</svg>\n')


written = {}


def save(name, content):
    (OUT / name).write_text(content)
    written[name] = content


# 1. Mark alone, with 10-unit padding.
P = 10
for k, sc in SCHEMES.items():
    w, h = MARK_W + 2 * P, MARK_H + 2 * P
    save(f"stacks-mark-{k}.svg", svg(w, h, bars(P, P, 1, sc["bars"])))

# 2. Horizontal lockup. Mark height = 1.3 x cap height, centred on the caps.
WORD_SIZE = 120
d, word_w, cap = text_path("Stacks", WORD_SIZE)
ms = (cap * 1.3) / MARK_H
mark_w, mark_h = MARK_W * ms, MARK_H * ms
gap = mark_h * 0.32
pad = mark_h * 0.5
W =pad * 2 + mark_w + gap + word_w
H = pad * 2 + mark_h
base_y = pad + mark_h / 2 + cap / 2
for k, sc in SCHEMES.items():
    body = bars(pad, pad, ms, sc["bars"]) + \
        f'<path transform="translate({pad + mark_w + gap:.2f} {base_y:.2f})" d="{d}" fill="{sc["word"]}"/>'
    save(f"stacks-logo-horizontal-{k}.svg", svg(round(W), round(H), body))

# 3. Stacked lockup: mark above word, centred.
ms2 = (word_w * 0.42) / MARK_W
m2w, m2h = MARK_W * ms2, MARK_H * ms2
pad2 = m2h * 0.4
gap2 = m2h * 0.35
W2 = word_w + pad2 * 2
H2 = pad2 * 2 + m2h + gap2 + cap
for k in ("light", "dark"):
    sc = SCHEMES[k]
    body = bars((W2 - m2w) / 2, pad2, ms2, sc["bars"]) + \
        f'<path transform="translate({pad2:.2f} {pad2 + m2h + gap2 + cap:.2f})" d="{d}" fill="{sc["word"]}"/>'
    save(f"stacks-logo-stacked-{k}.svg", svg(round(W2), round(H2), body))

# 4. App icon / favicon: mark centred in a rounded square.
def icon(size, bg, scheme, radius_ratio=0.22, fill=0.62):
    s = (size * fill) / MARK_W
    x = (size - MARK_W * s) / 2
    y = (size - MARK_H * s) / 2
    body = f'<rect width="{size}" height="{size}" rx="{size * radius_ratio:.2f}" fill="{bg}"/>' + bars(x, y, s, scheme["bars"])
    return svg(size, size, body)

save("stacks-app-icon-dark.svg", icon(1024, C["ink"], SCHEMES["dark"]))
save("stacks-app-icon-light.svg", icon(1024, C["white"], SCHEMES["light"]))
save("favicon.svg", icon(64, C["ink"], SCHEMES["dark"], fill=0.7))

# 5. Social card (GitHub social preview 1280x640), light and dark.
tag_d, tag_w, tag_cap = text_path("Your sources. Your ideas. One home.", 44, -0.01)
for k, bg in (("light", C["paper"]), ("dark", C["bg_dk"])):
    sc = SCHEMES[k]
    lx = (1280 - W) / 2
    ly = 150
    inner = (bars(lx + pad, ly + pad, ms, sc["bars"]) +
             f'<path transform="translate({lx + pad + mark_w + gap:.2f} {ly + base_y:.2f})" d="{d}" fill="{sc["word"]}"/>' +
             f'<path transform="translate({(1280 - tag_w) / 2:.2f} {ly + H + 70:.2f})" d="{tag_d}" fill="{C["slate"] if k == "light" else C["slate_dk"]}"/>' +
             f'<rect x="{(1280 - 64) / 2}" y="560" width="64" height="6" rx="3" fill="{C["signal"]}"/>')
    save(f"stacks-social-card-{k}.svg", svg(1280, 640, inner, bg=bg))

print("\n".join(sorted(written)))
