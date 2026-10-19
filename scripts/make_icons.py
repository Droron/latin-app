#!/usr/bin/env python3
"""Render the app icons as PNGs with the Python standard library only (no Pillow).

Design: Pompeian-red square, cream Ionic column, gold laurel wreath.
Usage: python3 scripts/make_icons.py OUTDIR
Writes apple-touch-icon.png (180), icon-192.png, icon-512.png, icon-maskable-512.png, favicon-32.png.
"""
import math, os, struct, sys, zlib

BG_TOP, BG_BOT = (0xB8, 0x4A, 0x2E), (0x7A, 0x27, 0x18)
CREAM, GOLD, FLUTE = (0xF7, 0xEE, 0xDC), (0xE8, 0xC2, 0x6E), (0xD9, 0xC8, 0xAE)


def sd_box(px, py, cx, cy, hw, hh, r=0.0):
    qx, qy = abs(px - cx) - hw + r, abs(py - cy) - hh + r
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def sd_ellipse(px, py, cx, cy, a, b, ang):
    c, s = math.cos(ang), math.sin(ang)
    x, y = (px - cx) * c + (py - cy) * s, -(px - cx) * s + (py - cy) * c
    k = math.hypot(x / a, y / b)
    return (k - 1) * min(a, b)


def shapes(maskable):
    """List of (bbox, sdf, color) in unit coordinates."""
    k = 0.82 if maskable else 1.0          # shrink artwork into the maskable safe zone
    T = lambda v: 0.5 + (v - 0.5) * k
    S = lambda v: v * k
    out = []
    def box(x0, y0, x1, y1, col, r=0.0):
        cx, cy, hw, hh = T((x0 + x1) / 2), T((y0 + y1) / 2), S((x1 - x0) / 2), S((y1 - y0) / 2)
        out.append(((cx - hw, cy - hh, cx + hw, cy + hh), lambda x, y, cx=cx, cy=cy, hw=hw, hh=hh, r=S(r): sd_box(x, y, cx, cy, hw, hh, r), col))
    def circ(cx, cy, r, col):
        cx, cy, r = T(cx), T(cy), S(r)
        out.append(((cx - r, cy - r, cx + r, cy + r), lambda x, y, cx=cx, cy=cy, r=r: math.hypot(x - cx, y - cy) - r, col))
    def ell(cx, cy, a, b, ang, col):
        cx, cy, a, b = T(cx), T(cy), S(a), S(b); m = max(a, b)
        out.append(((cx - m, cy - m, cx + m, cy + m), lambda x, y, cx=cx, cy=cy, a=a, b=b, ang=ang: sd_ellipse(x, y, cx, cy, a, b, ang), col))
    # laurel wreath: two branches along a circle, open at the top
    R, CX, CY = 0.335, 0.5, 0.52
    for side in (-1, 1):
        for i in range(8):
            t = math.radians(262 - i * 17)          # from bottom up the side
            x = CX + side * abs(R * math.cos(t))
            y = CY - R * math.sin(t)
            tang = math.atan2(R * math.cos(t), side * R * math.sin(t))
            off = 0.028 if i % 2 else -0.028
            nx, ny = (x - CX) / R, (y - CY) / R
            size = 1 - i * 0.045
            ell(x + nx * off, y + ny * off, 0.052 * size, 0.02 * size, tang + side * (0.5 if i % 2 else -0.5), GOLD)
    # stem
    for i in range(120):
        t = math.radians(262 - i * 1.1)
        for side in (-1, 1):
            circ(CX + side * abs(R * math.cos(t)), CY - R * math.sin(t), 0.0075, GOLD)
    # Ionic column
    box(0.33, 0.255, 0.67, 0.29, CREAM, 0.008)      # abacus
    box(0.36, 0.29, 0.64, 0.325, CREAM, 0.012)      # echinus
    circ(0.36, 0.312, 0.034, CREAM); circ(0.64, 0.312, 0.034, CREAM)   # volutes
    circ(0.36, 0.312, 0.013, FLUTE); circ(0.64, 0.312, 0.013, FLUTE)
    box(0.395, 0.325, 0.605, 0.70, CREAM)           # shaft
    for fx in (0.435, 0.478, 0.522, 0.565):
        box(fx - 0.0055, 0.345, fx + 0.0055, 0.68, FLUTE, 0.005)
    box(0.37, 0.70, 0.63, 0.728, CREAM, 0.006)      # torus
    box(0.335, 0.728, 0.665, 0.765, CREAM, 0.006)   # plinth
    return out


def render(size, maskable=False, rounded=False):
    W = size
    px = [[0.0, 0.0, 0.0, 1.0] for _ in range(W * W)]
    for j in range(W):
        t = j / (W - 1)
        col = [BG_TOP[c] + (BG_BOT[c] - BG_TOP[c]) * t for c in range(3)]
        for i in range(W):
            # subtle radial highlight
            d = math.hypot(i / W - 0.3, j / W - 0.2)
            h = max(0.0, 0.18 - d * 0.22)
            px[j * W + i] = [min(255, col[0] + 255 * h * 0.5), min(255, col[1] + 255 * h * 0.35), min(255, col[2] + 255 * h * 0.25), 1.0]
    aa = 1.0 / W
    for (x0, y0, x1, y1), f, col in shapes(maskable):
        i0, i1 = max(0, int((x0 - aa) * W)), min(W - 1, int((x1 + aa) * W) + 1)
        j0, j1 = max(0, int((y0 - aa) * W)), min(W - 1, int((y1 + aa) * W) + 1)
        for j in range(j0, j1 + 1):
            y = (j + 0.5) / W
            for i in range(i0, i1 + 1):
                d = f((i + 0.5) / W, y)
                a = min(1.0, max(0.0, 0.5 - d / aa))
                if a > 0:
                    p = px[j * W + i]
                    for c in range(3):
                        p[c] = p[c] * (1 - a) + col[c] * a
    if rounded:
        r = 0.22
        for j in range(W):
            for i in range(W):
                d = sd_box((i + 0.5) / W, (j + 0.5) / W, 0.5, 0.5, 0.5, 0.5, r)
                px[j * W + i][3] = min(1.0, max(0.0, 0.5 - d / aa))
    return px


def write_png(path, W, px):
    raw = bytearray()
    for j in range(W):
        raw.append(0)
        for i in range(W):
            p = px[j * W + i]
            raw += bytes((int(round(p[0])), int(round(p[1])), int(round(p[2])), int(round(p[3] * 255))))
    def chunk(t, d):
        c = struct.pack('>I', len(d)) + t + d
        return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, W, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as fh:
        fh.write(png)


def main(outdir):
    os.makedirs(outdir, exist_ok=True)
    specs = [('apple-touch-icon.png', 180, False, False), ('icon-192.png', 192, False, False), ('icon-512.png', 512, False, False),
             ('icon-maskable-512.png', 512, True, False), ('favicon-32.png', 32, False, True)]
    for name, size, mask, rnd in specs:
        write_png(os.path.join(outdir, name), size, render(size, mask, rnd))
    print('icons ->', outdir)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app', 'icons'))
