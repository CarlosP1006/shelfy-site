"""Reduz os PNGs de img/ para paleta indexada (libimagequant, o motor do pngquant) e recomprime sem perdas (oxipng).

Uso: pip install pillow imagequant pyoxipng && python3 dev/otimizar-png.py
"""
from pathlib import Path

import imagequant
import oxipng
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ALVOS = {"img/og.png": 256, "img/apple-touch-icon.png": 128, "img/favicon-32.png": 64}

for caminho, cores in ALVOS.items():
    arquivo = RAIZ / caminho
    antes = arquivo.stat().st_size
    imagem = Image.open(arquivo).convert("RGBA")
    reduzida = imagequant.quantize_pil_image(imagem, dithering_level=1.0, max_colors=cores, min_quality=0, max_quality=100)
    reduzida.save(arquivo, optimize=True)
    oxipng.optimize(arquivo, level=6, strip=oxipng.StripChunks.safe())
    print(f"{caminho}: {antes} -> {arquivo.stat().st_size} bytes")
