"""
Re-themes the studio deck in the site's light.

The source deck is a PDF of full-page 1920x1080 images on a near-black ground.
For every page this finds the black ground (the near-black region touching the
page edges), lifts it off by un-blending against that black — so type keeps
clean edges with no dark halo — and lays the result over the site's main
light: the landing's azure and electric-blue beams, rendered with the same
lights as the page shader. Each page catches the light at a different moment
of its swing, so leafing through the PDF it shifts the way it does on the site.

Outputs
  public/docs/the-atlas-studio.pdf   the deck to open or download, gradient baked in
  public/deck/slide-NN.webp          each page with its ground transparent, for the
                                     on-site viewer that shows the live gradient behind

Usage
  python scripts/deck/retheme.py path/to/source.pdf
"""

import io
import sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
PDF_OUT = ROOT / "public" / "docs" / "the-atlas-studio.pdf"
SLIDES_OUT = ROOT / "public" / "deck"

# The Figma swatches the page shader uses (sRGB, 0-1).
NAVY = np.array([0.00784, 0.03529, 0.13725])
ELECTRIC = np.array([0.03137, 0.16863, 1.0])
AZURE = np.array([0.06667, 0.43922, 0.80392])

# How far from the ground colour a pixel may be and still count as ground.
TOLERANCE = 0.025


def light(px, py, cx, cy, rx, ry, angle):
    """One soft anisotropic light, as in the shader: a rotated gaussian."""
    dx, dy = px - cx, py - cy
    cs, sn = np.cos(angle), np.sin(angle)
    qx = (cs * dx + sn * dy) / rx
    qy = (cs * dy - sn * dx) / ry
    return np.exp(-0.5 * (qx * qx + qy * qy))


def gradient(width, height, t, beat):
    """The landing's main light — azure and electric-blue beams on navy — at one moment of its swing."""
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float64)
    # The shader works in the 1440x807 design frame.
    px = xs * 1440.0 / width
    py = ys * 807.0 / height
    c = np.broadcast_to(NAVY, (height, width, 3)).copy()
    # A beam from the top centre spilling right.
    c += (0.99 * (1 + 0.07 * np.sin(t * 0.27) + 0.22 * beat) * light(
        px, py,
        709 + 70 * np.sin(t * 0.27) + 200 * beat, -69 + 30 * np.sin(t * 0.37 + 1) + 25 * beat,
        372 * (1 + 0.12 * beat), 187 * (1 + 0.12 * beat), 0.391 + 0.08 * np.sin(t * 0.19) + 0.16 * beat,
    ))[..., None] * (AZURE - NAVY)
    # Electric blue pouring in from the top right.
    c += (1.17 * (1 - 0.2 * beat) * light(
        px, py,
        2469 + 120 * np.sin(t * 0.21 + 2) - 160 * beat, 56 + 60 * np.sin(t * 0.3) + 60 * beat,
        860, 238, -0.091 + 0.05 * np.sin(t * 0.17 + 0.5) + 0.06 * beat,
    ))[..., None] * (ELECTRIC - NAVY)
    # A second across the bottom left.
    c += (0.74 * (1 + 0.25 * beat) * light(
        px, py,
        -800 + 120 * np.sin(t * 0.2 + 4) + 140 * beat, 592 + 50 * np.sin(t * 0.33 + 2) - 60 * beat,
        922, 242, 0.264 + 0.05 * np.sin(t * 0.23) - 0.05 * beat,
    ))[..., None] * (ELECTRIC - NAVY)
    # And a low azure glow along the foot.
    c += (0.71 * (1 + 0.1 * np.sin(t * 0.31 + 3) - 0.25 * beat) * light(
        px, py,
        776 + 90 * np.sin(t * 0.33 + 1.5) - 180 * beat, 866 + 25 * np.sin(t * 0.23) - 20 * beat,
        493, 131, 0.292 + 0.06 * np.sin(t * 0.29 + 2) - 0.1 * beat,
    ))[..., None] * (AZURE - NAVY)
    # A whisper of noise keeps the deep blues from banding once compressed.
    rng = np.random.default_rng(7)
    c += (rng.random((height, width, 1)) - 0.5) * (1.5 / 255.0)
    return np.clip(c, 0.0, 1.0)


def ground(image):
    """The ground colour, how opaque each pixel is over it, and where the ground (and its fringe) lies."""
    border = np.concatenate([image[0], image[-1], image[:, 0], image[:, -1]])
    base = np.median(border, axis=0)
    near = np.abs(image - base).max(axis=2) < TOLERANCE
    labels, _ = ndimage.label(near)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    region = np.isin(labels, edge[edge > 0])
    # Two pixels of fringe, so the anti-aliased edges of type un-blend cleanly.
    region = ndimage.binary_dilation(region, iterations=2)
    # Colour-to-alpha against the ground: the least opacity that explains each pixel.
    lift = np.clip((image - base) / np.maximum(1.0 - base, 1e-6), 0.0, 1.0).max(axis=2)
    alpha = np.where(region, lift, 1.0)
    return base, alpha


def main(source):
    doc = pymupdf.open(source)
    SLIDES_OUT.mkdir(parents=True, exist_ok=True)
    PDF_OUT.parent.mkdir(parents=True, exist_ok=True)
    out = pymupdf.open()
    for index, page in enumerate(doc):
        xref = page.get_images()[0][0]
        image = np.asarray(Image.open(io.BytesIO(doc.extract_image(xref)["image"])).convert("RGB")) / 255.0
        height, width = image.shape[:2]
        base, alpha = ground(image)

        # The deck to download: the page laid over the gradient at this page's moment.
        light_field = gradient(width, height, t=2.4 * index * 0.83, beat=np.sin(index * 1.1))
        baked = np.clip(image + (1.0 - alpha)[..., None] * (light_field - base), 0.0, 1.0)
        jpeg = io.BytesIO()
        Image.fromarray((baked * 255 + 0.5).astype(np.uint8)).save(jpeg, "JPEG", quality=90, subsampling=0, optimize=True)
        sheet = out.new_page(width=page.rect.width, height=page.rect.height)
        sheet.insert_image(sheet.rect, stream=jpeg.getvalue())

        # The page for the on-site viewer: its ground transparent, the type un-blended.
        safe = np.maximum(alpha, 1e-3)[..., None]
        colour = np.clip(base + (image - base) / safe, 0.0, 1.0)
        rgba = np.dstack([colour, alpha]) * 255 + 0.5
        Image.fromarray(rgba.astype(np.uint8), "RGBA").save(
            SLIDES_OUT / f"slide-{index + 1:02d}.webp", "WEBP", quality=88, alpha_quality=92, method=6
        )
        print(f"page {index + 1}: ground {np.round(base * 255).astype(int)}, {np.mean(alpha < 0.5) * 100:.0f}% lifted")

    out.set_metadata({"title": "The Atlas Studio", "author": "Gulafsan Shaheen"})
    out.save(PDF_OUT, garbage=4, deflate=True)
    print(f"wrote {PDF_OUT.relative_to(ROOT)} and {len(doc)} slides in {SLIDES_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
