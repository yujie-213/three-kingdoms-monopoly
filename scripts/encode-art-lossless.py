"""Encode generated PNG art as WebP without changing geometry or RGBA pixels.

Usage: python scripts/encode-art-lossless.py assets/name.png [...]
Requires Pillow with WebP support. Original generated PNGs are preserved.
"""
import sys
from pathlib import Path
from PIL import Image

for argument in sys.argv[1:]:
    source = Path(argument)
    destination = source.with_suffix('.webp')
    with Image.open(source) as picture:
        rgba = picture.convert('RGBA')
        rgba.save(destination, 'WEBP', lossless=True, exact=True, method=6)
        with Image.open(destination) as decoded:
            if decoded.convert('RGBA').tobytes() != rgba.tobytes():
                raise ValueError(f'Pixel verification failed: {source}')
    print(f'{destination}: {source.stat().st_size} -> {destination.stat().st_size} bytes, RGBA unchanged')
