"""Rebrand the Stacks overview video in the Index palette.

The original video's source project wasn't kept, so this rebuilds it from the
original MP4: it renders a full-frame plate (background, text, logo) per scene
plus transparent overlays, then lays the original Obsidian and Zotero screen
footage onto them with ffmpeg. Scene times, window positions and wording are
measured from the original 58.2 s, 1920x1080 cut.

Usage: python3 rebrand_video.py <original.mp4> <logo-dark.png> <fonts-dir> <out.mp4>

<logo-dark.png> is brand/stacks-logo/png/stacks-logo-horizontal-dark.png.
<fonts-dir> holds SpaceGrotesk-Regular.ttf, -Medium.ttf and -Bold.ttf: static
instances (400/500/700) of Space Grotesk's variable font, made with fontTools'
instancer as build_logo.py does. Needs ImageMagick 7 and ffmpeg.
"""
import subprocess
import sys
import tempfile
from pathlib import Path

SRC, LOGO, FONTS, OUT = sys.argv[1], sys.argv[2], Path(sys.argv[3]), sys.argv[4]
WORK = Path(tempfile.mkdtemp(prefix="stacks-video-"))
BOLD, MED, REG = (str(FONTS / f"SpaceGrotesk-{w}.ttf") for w in ("Bold", "Medium", "Regular"))

W, H, DUR = 1920, 1080, 58.2
BG_TOP, BG_BOT = "#141A21", "#0B0E12"
PAPER, BODY, MUTED, LINE = "#EEF1F4", "#B6BFCA", "#8E98A6", "#252D37"
SIGNAL, SIGNAL_INK, SURFACE = "#FF5A1F", "#FF8A5C", "#12171D"
WIN = (1034, 60, 776, 960)        # Obsidian window in the split scenes
ZOT = (100, 70, 1720, 930)        # Zotero window

def magick(*args):
    subprocess.run(["magick", *map(str, args)], check=True)

def text(path, s, font, size, color, width=None, kerning=0, spacing=0, gravity="West"):
    cmd = ["-background", "none", "-fill", color, "-font", font, "-pointsize", size,
           "-kerning", kerning, "-interline-spacing", spacing, "-gravity", gravity]
    if width:
        cmd += ["-size", f"{width}x", f"caption:{s}"]
    else:
        cmd += [f"label:{s}"]
    magick(*cmd, "-trim", "+repage", path)

def size_of(path):
    out = subprocess.run(["magick", "identify", "-format", "%w %h", path], check=True,
                         capture_output=True, text=True).stdout.split()
    return int(out[0]), int(out[1])

def background(path, shadows=()):
    cmd = ["-size", f"{W}x{H}", f"gradient:{BG_TOP}-{BG_BOT}"]
    for (x, y, w, h, r) in shadows:
        # soft shadow, then a placeholder panel where footage will sit
        cmd += ["(", "-size", f"{W}x{H}", "xc:none", "-fill", "#000000B0",
                "-draw", f"roundrectangle {x},{y + 18} {x + w},{y + h + 18} {r},{r}",
                "-blur", "0x28", ")", "-composite",
                "-fill", SURFACE, "-draw", f"roundrectangle {x},{y} {x + w - 1},{y + h - 1} {r},{r}"]
    magick(*cmd, path)

logo_small = WORK / "logo-small.png"
magick(LOGO, "-resize", "x40", logo_small)
logo_big = WORK / "logo-big.png"
magick(LOGO, "-resize", "620x", logo_big)

def split_plate(name, eyebrow, headline, body):
    bg = WORK / f"{name}-bg.png"
    background(bg, shadows=[(*WIN, 16)])
    eb, hl, bd = (WORK / f"{name}-{k}.png" for k in ("eb", "hl", "bd"))
    text(eb, eyebrow.upper(), MED, 26, SIGNAL_INK, kerning=3)
    text(hl, headline, BOLD, 74, PAPER, kerning=-1.5, spacing=-8)
    text(bd, body, REG, 33, BODY, width=760, spacing=6)
    (ew, eh), (hw, hh), (bw, bh) = size_of(eb), size_of(hl), size_of(bd)
    block_h = eh + 34 + hh + 36 + bh
    top = (H - block_h) // 2
    x = 120
    magick(bg,
           "-fill", SIGNAL, "-draw", f"rectangle {x},{top + eh // 2 - 3} {x + 46},{top + eh // 2 + 3}",
           eb, "-geometry", f"+{x + 66}+{top}", "-composite",
           hl, "-geometry", f"+{x}+{top + eh + 34}", "-composite",
           bd, "-geometry", f"+{x}+{top + eh + 34 + hh + 36}", "-composite",
           logo_small, "-geometry", "+64+990", "-composite",
           WORK / f"{name}.png")
    return WORK / f"{name}.png"

def centered(base, layers, out):
    """layers: (png, center_y). Composites each centred horizontally."""
    args = [base]
    for png, cy in layers:
        w, h = size_of(png)
        args += [png, "-geometry", f"+{(W - w) // 2}+{cy - h // 2}", "-composite"]
    magick(*args, out)

def overlay_canvas(out, draws):
    magick("-size", f"{W}x{H}", "xc:none", *draws, out)

plates = {}

# Title card (tagline fades in separately).
bg = WORK / "plain-bg.png"
background(bg)
centered(bg, [(logo_big, 470)], WORK / "title.png")
tag, sub = WORK / "tag.png", WORK / "sub.png"
text(tag, "Your sources. Your ideas. One home.", MED, 46, PAPER, kerning=-0.5)
text(sub, "A research library inside Obsidian", REG, 30, MUTED)
overlay_canvas(WORK / "tagline.png", [])
centered(WORK / "tagline.png", [(tag, 610), (sub, 672)], WORK / "tagline.png")

scenes = [
    ("s1", "Your library", "Your whole library, in\nyour vault.", "Thousands of references as plain Markdown notes, ready to link, search and cite."),
    ("s2", "One note per source", "Metadata, abstract\nand highlights.\nTogether.", "Properties hold the details. The note holds your annotations and your thinking."),
    ("s3", "Built on Obsidian Bases", "A view for every stage\nof reading.", "Queue, Reviewing, Recently read. Switch with a click."),
    ("s4", "Collections", "Group your library\nany way you think.", "Collections are just properties, so a source can live in several."),
    ("s5", "Bookshelf", "Browse it like a\nbookshelf.", "Cards, tables, lists. Your library, your layout."),
    ("s6", "Add reference", "Paste an ISBN, DOI or\nURL.", "Stacks looks it up, writes the note and files it."),
    ("after", "After the move", "Same library. Now it\nlives where you think.", "Links, graph, search and Bases, all on your references."),
]
for s in scenes:
    plates[s[0]] = split_plate(*s)

# Zotero title.
zt1, zt2 = WORK / "zt1.png", WORK / "zt2.png"
text(zt1, "Already have a Zotero library?", BOLD, 80, PAPER, kerning=-1.5)
text(zt2, "Bring it with you.", MED, 48, SIGNAL)
centered(bg, [(zt1, 480), (zt2, 590)], WORK / "zt.png")

# Zotero footage plate and caption pills.
zf_bg = WORK / "zf.png"
background(zf_bg, shadows=[(*ZOT, 20)])
def pill(out, label, width):
    t = WORK / f"{out.stem}-t.png"
    text(t, label, BOLD, 52, PAPER, kerning=-0.5)
    x0, y0, h = (W - width) // 2, 885, 116
    overlay_canvas(out, ["-fill", "#0B0E12", "-stroke", LINE, "-strokewidth", 2,
                         "-draw", f"roundrectangle {x0},{y0} {x0 + width},{y0 + h} 58,58"])
    centered(out, [(t, y0 + h // 2 + 2)], out)
pill(WORK / "pill1.png", "Years of collections, PDFs and highlights…", 1250)
pill(WORK / "pill2.png", "…none of it left behind.", 790)

# Import mapping card.
hdr_t, prev_t = WORK / "imp-h.png", WORK / "imp-p.png"
text(hdr_t, "Stacks: Import from Zotero", MED, 44, PAPER)
text(prev_t, "Preview first. Undo any time.", REG, 34, SIGNAL_INK)
hw, hh = size_of(hdr_t)
imp = WORK / "imp.png"
magick(bg, "-fill", SURFACE, "-stroke", SIGNAL, "-strokewidth", 2,
       "-draw", f"roundrectangle {(W - hw) // 2 - 44},150 {(W + hw) // 2 + 44},230 16,16", imp)
centered(imp, [(hdr_t, 190), (prev_t, 292)], imp)
rows = [("Better BibTeX citekeys", "note names"), ("Collections", "properties + Base views"),
        ("PDFs, ebooks, highlights", "attachments + highlight counts"), ("Your existing notes", "bodies left untouched")]
for i, (left, right) in enumerate(rows):
    y = 390 + i * 130
    lt, rt, ar = WORK / f"r{i}l.png", WORK / f"r{i}r.png", WORK / f"r{i}a.png"
    text(lt, left, REG, 42, BODY)
    text(rt, right, BOLD, 42, PAPER)
    text(ar, "→", BOLD, 46, SIGNAL)
    out = WORK / f"row{i}.png"
    _, lh = size_of(lt); _, rh = size_of(rt); _, ah = size_of(ar)
    overlay_canvas(out, ["-fill", SURFACE, "-stroke", LINE, "-strokewidth", 2,
                         "-draw", f"roundrectangle 260,{y} 1660,{y + 100} 18,18",
                         lt, "-geometry", f"+310+{y + 50 - lh // 2}", "-composite",
                         ar, "-geometry", f"+925+{y + 50 - ah // 2}", "-composite",
                         rt, "-geometry", f"+1010+{y + 50 - rh // 2}", "-composite"])

# End card.
e1, e2, e3 = WORK / "e1.png", WORK / "e2.png", WORK / "e3.png"
text(e1, "Free in Obsidian’s Community plugins", MED, 44, PAPER)
text(e2, "Settings → Community plugins → Browse → “Stacks”", MED, 32, "#0F1419")
text(e3, "jag3773.github.io/obsidian-stacks", REG, 32, MUTED)
w2, _ = size_of(e2)
end = WORK / "end.png"
magick(bg, "-fill", SIGNAL, "-draw", f"roundrectangle {(W - w2) // 2 - 34},676 {(W + w2) // 2 + 34},744 34,34", end)
centered(end, [(logo_big, 420), (e1, 600), (e2, 711), (e3, 820)], end)

# Rounded masks for the footage.
def mask(out, w, h, r):
    magick("-size", f"{w}x{h}", "xc:black", "-fill", "white", "-draw", f"roundrectangle 0,0 {w - 1},{h - 1} {r},{r}", out)
mask(WORK / "mask-win.png", WIN[2], WIN[3], 16)
mask(WORK / "mask-zot.png", ZOT[2], ZOT[3], 20)

# ---- Composite -------------------------------------------------------------
F = 0.7  # crossfade length
# (file, fade-in start, fade-out start or None, fade-out length)
layers = [
    ("title.png", None, None),
    ("tagline.png", 0.6, None),
    ("s1.png", 4.0 - F / 2, None),
    ("s2.png", 9.3 - F / 2, None),
    ("s3.png", 13.75 - F / 2, None),
    ("s4.png", 19.6 - F / 2, None),
    ("s5.png", 24.55 - F / 2, None),
    ("s6.png", 28.55 - F / 2, None),
    ("WIN_A", 4.0 - F / 2, None),
    ("zt.png", 31.4 - F / 2, None),
    ("zf.png", 34.1 - F / 2, None),
    ("ZOT", 34.1 - F / 2, None),
    ("pill1.png", 34.1 - F / 2, 39.7),
    ("pill2.png", 39.75, None),
    ("imp.png", 43.6 - F / 2, None),
    ("row0.png", 44.25, None),
    ("row1.png", 44.85, None),
    ("row2.png", 45.45, None),
    ("row3.png", 46.05, None),
    ("after.png", 50.2 - F / 2, None),
    ("WIN_B", 50.2 - F / 2, None),
    ("end.png", 53.75 - F / 2, None),
]
inputs = ["-i", SRC]
graph = []
idx = 1
masks = {}
for name in ("mask-win.png", "mask-zot.png"):
    inputs += ["-loop", "1", "-framerate", "30", "-t", str(DUR), "-i", str(WORK / name)]
    masks[name] = idx
    idx += 1
graph.append("[0:v]split=3[va][vb][vz]")
def held(label, rect, start, end, out):
    """Crop footage between start and end, holding the first and last clean frames
    outside that span, so the original's crossfades into its old backgrounds never show."""
    x, y, w, h = rect
    graph.append(f"[{label}]crop={w}:{h}:{x}:{y},trim=start={start}:end={end},setpts=PTS-STARTPTS,"
                 f"tpad=start_mode=clone:start_duration={start}:stop_mode=clone:stop_duration={DUR},"
                 f"trim=end={DUR},format=rgba[{out}]")
held("va", WIN, 4.45, 31.0, "wa0")
held("vb", WIN, 50.65, 53.35, "wb0")
held("vz", ZOT, 34.5, 43.2, "wz0")
graph.append(f"[{masks['mask-win.png']}:v]format=gray,split=2[mwa][mwb]")
graph.append("[wa0][mwa]alphamerge[wa1]")
graph.append("[wb0][mwb]alphamerge[wb1]")
graph.append(f"[{masks['mask-zot.png']}:v]format=gray[mz];[wz0][mz]alphamerge[wz1]")
footage = {"WIN_A": ("wa1", WIN), "WIN_B": ("wb1", WIN), "ZOT": ("wz1", ZOT)}

cur = None
for i, (name, fin, fout) in enumerate(layers):
    lab = f"l{i}"
    if name in footage:
        src, (x, y, _, _) = footage[name]
        f = f"fade=t=in:st={fin:.2f}:d={F}:alpha=1"
        graph.append(f"[{src}]{f}[{lab}]")
        graph.append(f"[{cur}][{lab}]overlay={x}:{y}:eof_action=pass[c{i}]")
    else:
        inputs += ["-loop", "1", "-framerate", "30", "-t", str(DUR), "-i", str(WORK / name)]
        chain = "format=rgba"
        if fin is not None:
            d = 0.45 if name.startswith("row") or name == "pill2.png" else (0.8 if name == "tagline.png" else F)
            chain += f",fade=t=in:st={fin:.2f}:d={d}:alpha=1"
        if fout is not None:
            chain += f",fade=t=out:st={fout:.2f}:d=0.5:alpha=1"
        if cur is None:
            graph.append(f"[{idx}:v]{chain}[c{i}]")
        else:
            graph.append(f"[{idx}:v]{chain}[{lab}]")
            graph.append(f"[{cur}][{lab}]overlay=0:0[c{i}]")
        idx += 1
    cur = f"c{i}"
graph.append(f"[{cur}]format=yuv420p[out]")

cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(graph),
       "-map", "[out]", "-t", str(DUR), "-r", "30", "-c:v", "libx264", "-preset", "slow",
       "-crf", "27", "-movflags", "+faststart", OUT]
subprocess.run(cmd, check=True)
print("wrote", OUT)
