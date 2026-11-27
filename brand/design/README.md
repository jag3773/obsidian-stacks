# Website design sources

The Index direction for the Stacks website, as Design canvas files (`.dc.html`, one per artboard, laid out by `canvas.json`).

| File | Artboard |
|---|---|
| `Main.dc.html` | Index landing page, light and dark |
| `A-System.dc.html` | Index palette, type and components, light and dark |
| `Logo.dc.html` | Logo package overview |
| `B-Landing.dc.html`, `B-System.dc.html` | Night Shelf, the alternative direction that wasn't chosen |

The built site in [`site/`](../../site) is the implementation of `Main.dc.html` and `A-System.dc.html`. Images in these files point to `/_blob/…` uploads on the canvas, so they don't resolve outside it; the same images are in [`brand/stacks-logo/`](../stacks-logo).
