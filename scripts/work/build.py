"""
Renders each project's PDF into the pages the work viewer shows.

For every deck in DECKS this writes
  public/work/<deck>/NN.webp          each page at reading resolution (2x screens)
  public/work/<deck>/NN-half.webp     the same at half the width (phones, 1x screens)
  src/content/decks/<deck>.json       every page's files and size, its average tone,
                                      and a 24px preview the viewer blurs into the
                                      page's placeholder and into the light behind it

The pages are served as they are, by srcset, rather than through the image
optimiser: encoding 2400px pages on first request is slow, and these are
already the sizes the viewer reads at.

The PDFs themselves are not published: the viewer only needs the pages, and
the largest export (Dorikala, 105 MB) is over GitHub's file limit.

Usage
  python scripts/work/build.py path/to/folder/with/the/pdfs [deck ...]
"""

import base64
import io
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PAGES_OUT = ROOT / "public" / "work"
DATA_OUT = ROOT / "src" / "content" / "decks"

# Deck id -> the PDF it is rendered from. A project can have more than one deck
# (FreightEasy has its presentation and its A4 brochure).
DECKS = {
    "yooj": "YOOJ Brand Guidelines Presentation.pdf",
    "dorikala": "Dorikala_Brand_Guidelines_Presentation.pdf",
    "kidcity": "Kidcity Branding.pdf",
    "fresh-feast": "Fresh Feast (1).pdf",
    "spring-chu": "Spring Chu Branding.pdf",
    "zenoxa": "Zenoxa 2.pdf",
    "freighteasy": "FSPL Deck_Light.pdf",
    "freighteasy-brochure": "FSPL Deck (2).pdf",
}

# Widths, in pixels, at which pages are read on a 2x screen: slides fill the
# reading column, square and portrait pages are held to the screen's height.
WIDE = 2400
NARROW = 1800
QUALITY = 86
PREVIEW_WIDTH = 24


def render(deck, source):
    doc = pymupdf.open(source)
    folder = PAGES_OUT / deck
    folder.mkdir(parents=True, exist_ok=True)
    for stale in folder.glob("*.webp"):
        stale.unlink()

    pages = []
    for index, page in enumerate(doc):
        ratio = page.rect.width / page.rect.height
        zoom = (WIDE if ratio > 1.2 else NARROW) / page.rect.width
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False, colorspace=pymupdf.csRGB)
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)

        name = f"{index + 1:02d}.webp"
        half = f"{index + 1:02d}-half.webp"
        image.save(folder / name, "WEBP", quality=QUALITY, method=6)
        small = image.resize((round(image.width / 2), round(image.height / 2)), Image.LANCZOS)
        small.save(folder / half, "WEBP", quality=QUALITY, method=6)

        tiny = image.resize((PREVIEW_WIDTH, max(1, round(PREVIEW_WIDTH / ratio))), Image.LANCZOS)
        buffer = io.BytesIO()
        tiny.save(buffer, "WEBP", quality=60, method=6)
        r, g, b = image.resize((1, 1), Image.BOX).getpixel((0, 0))

        pages.append(
            {
                "src": f"/work/{deck}/{name}",
                "half": f"/work/{deck}/{half}",
                "width": image.width,
                "height": image.height,
                "tone": f"#{r:02x}{g:02x}{b:02x}",
                "preview": "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode("ascii"),
            }
        )

    DATA_OUT.mkdir(parents=True, exist_ok=True)
    (DATA_OUT / f"{deck}.json").write_text(json.dumps({"pages": pages}, indent=2) + "\n", encoding="utf-8")
    size = sum(f.stat().st_size for f in folder.glob("*.webp"))
    return f"{deck}: {len(pages)} pages, {size / 1e6:.1f} MB"


def main(folder, only):
    folder = Path(folder)
    decks = {deck: name for deck, name in DECKS.items() if not only or deck in only}
    missing = [name for name in decks.values() if not (folder / name).exists()]
    if missing:
        sys.exit("Missing PDFs in {}:\n  {}".format(folder, "\n  ".join(missing)))
    with ProcessPoolExecutor() as pool:
        jobs = [pool.submit(render, deck, str(folder / name)) for deck, name in decks.items()]
        for job in jobs:
            print(job.result())


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], set(sys.argv[2:]))
