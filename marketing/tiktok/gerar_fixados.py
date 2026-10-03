"""Gera os vídeos fixados do TikTok (Black e White).

Uso: python3 gerar_fixados.py <pasta_fontes>
Fontes esperadas: Poppins-Bold.ttf, Poppins-Black.ttf, NotoEmoji.ttf (monocromático).
Saída: fixado-black.mp4, fixado-white.mp4 e os PNGs de cada quadro em ./quadros/.
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
MARGIN_X = 90
TOP, BOTTOM = 250, 1450
FRAME_SECONDS = 5.5  # 4 quadros -> 22 s
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "fonts")

EMOJI = {"\U0001F44B", "\U0001F49B", "\U0001F6CD"}

# Tamanhos: texto normal (Poppins Bold) e destaque (Poppins Black, um pouco maior).
S_TITLE, S_BODY, S_HL = 120, 82, 98


def frames(handle):
    # Cada linha: (texto, estilo, tamanho, espaço extra antes)
    return [
        [("Oi! \U0001F44B", "b", S_TITLE, 0),
         ("Por que não tem", "b", S_BODY, 60),
         ("link na nossa bio?", "b", S_BODY, 0)],
        [("O TikTok só libera", "b", S_BODY, 0),
         ("link clicável com", "b", S_BODY, 0),
         ("1.000 seguidores.", "h", S_HL, 20)],
        [("Mas é fácil! \U0001F49B", "b", S_TITLE, 0),
         ("1) Procure", "b", S_BODY - 6, 70),
         (f"@{handle}", "h", S_HL - 6, 0),
         ("no Instagram", "b", S_BODY - 6, 0),
         ("2) Abra o link da bio", "b", S_BODY - 6, 40),
         ("3) Digite o código", "b", S_BODY - 6, 40),
         ("do produto", "b", S_BODY - 6, 0),
         ("Exemplo: P00022", "b", S_BODY - 6, 40)],
        [("Seguindo a gente", "b", S_BODY, 0),
         ("por aqui, chegamos", "b", S_BODY, 0),
         ("nos 1.000 mais rápido.", "b", S_BODY, 0),
         ("Obrigado! \U0001F6CD", "b", S_TITLE, 70)],
    ]


def font(style, size):
    name = "Poppins-Black.ttf" if style == "h" else "Poppins-Bold.ttf"
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def emoji_font(size):
    f = ImageFont.truetype(os.path.join(FONTS, "NotoEmoji.ttf"), size)
    f.set_variation_by_axes([700])
    return f


def runs(text):
    """Separa o texto em trechos de texto normal e emoji."""
    out = []
    for ch in text:
        kind = "e" if ch in EMOJI else "t"
        if out and out[-1][0] == kind:
            out[-1][1] += ch
        else:
            out.append([kind, ch])
    return out


def measure(text, style, size):
    width = 0
    for kind, s in runs(text):
        f = emoji_font(int(size * 0.9)) if kind == "e" else font(style, size)
        width += f.getlength(s)
    return width


def render(lines, bg, fg):
    # Reduz tudo proporcionalmente se alguma linha estourar a largura útil.
    max_w = W - 2 * MARGIN_X
    scale = min(1.0, min(max_w / measure(t, st, sz) for t, st, sz, _ in lines))
    lines = [(t, st, int(sz * scale), int(gap * scale)) for t, st, sz, gap in lines]

    line_h = [int(sz * 1.25) for _, _, sz, _ in lines]
    total = sum(line_h) + sum(g for *_, g in lines)
    assert total <= BOTTOM - TOP, f"texto alto demais: {total}px"

    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    y = TOP + (BOTTOM - TOP - total) / 2
    for (text, style, size, gap), lh in zip(lines, line_h):
        y += gap
        baseline = y + lh * 0.78
        x = (W - measure(text, style, size)) / 2
        for kind, s in runs(text):
            if kind == "e":
                f = emoji_font(int(size * 0.9))
                d.text((x, baseline + size * 0.08), s, font=f, fill=fg, anchor="ls")
            else:
                f = font(style, size)
                d.text((x, baseline), s, font=f, fill=fg, anchor="ls")
            x += f.getlength(s)
        y += lh
    return img


def build(name, handle, bg, fg):
    outdir = os.path.join(HERE, "quadros")
    os.makedirs(outdir, exist_ok=True)
    pngs = []
    for i, lines in enumerate(frames(handle), 1):
        p = os.path.join(outdir, f"{name}-quadro{i}.png")
        render(lines, bg, fg).save(p)
        pngs.append(p)

    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    for p in pngs:
        cmd += ["-loop", "1", "-framerate", "30", "-t", str(FRAME_SECONDS), "-i", p]
    concat = "".join(f"[{i}:v]" for i in range(len(pngs)))
    cmd += ["-filter_complex", f"{concat}concat=n={len(pngs)}:v=1:a=0,format=yuv420p[v]",
            "-map", "[v]", "-r", "30", "-c:v", "libx264", "-profile:v", "high",
            "-preset", "slow", "-crf", "16", "-tune", "stillimage", "-an",
            "-movflags", "+faststart", os.path.join(HERE, f"{name}.mp4")]
    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    build("fixado-black", "shelfy_black", (0, 0, 0), (255, 255, 255))
    build("fixado-white", "shelfywhite", (255, 255, 255), (0, 0, 0))
