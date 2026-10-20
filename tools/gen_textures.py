"""Procedural PBR texture generator for the DOMATEK configurator.

Produces seamless (periodic) wood, end-grain and gravel textures:
  public/assets/tex/gen/<name>_color.webp
  public/assets/tex/gen/<name>_normal.webp
  public/assets/tex/gen/<name>_rough.webp

Run:  python3 tools/gen_textures.py
Noise is generated in the frequency domain, so every map tiles perfectly.
"""
import os
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'tex', 'gen')
os.makedirs(OUT, exist_ok=True)
RNG = np.random.default_rng(54)


def fnoise(h, w, fx, fy, power=2.0, seed=None):
    """Periodic gaussian noise. fx/fy = characteristic frequency (cycles per image)."""
    rng = np.random.default_rng(seed) if seed is not None else RNG
    ky = np.fft.fftfreq(h)[:, None] * h / max(fy, 1e-6)
    kx = np.fft.fftfreq(w)[None, :] * w / max(fx, 1e-6)
    k = np.sqrt(kx ** 2 + ky ** 2)
    amp = 1.0 / (1.0 + k ** power)
    amp[0, 0] = 0
    spec = (rng.normal(size=(h, w)) + 1j * rng.normal(size=(h, w))) * amp
    n = np.real(np.fft.ifft2(spec))
    n -= n.mean()
    return n / (n.std() + 1e-9)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def normal_from_height(hgt, strength):
    gy, gx = np.gradient(hgt)
    gx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5
    gy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * 0.5
    nx = -gx * strength
    ny = gy * strength  # OpenGL convention (green up)
    nz = np.ones_like(hgt)
    ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    n = np.stack([nx / ln, ny / ln, nz / ln], -1)
    return ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)


def save(name, color, normal, rough, q=90):
    Image.fromarray(color).save(os.path.join(OUT, f'{name}_color.webp'), quality=q, method=6)
    Image.fromarray(normal).save(os.path.join(OUT, f'{name}_normal.webp'), quality=q, method=6)
    Image.fromarray((rough * 255).clip(0, 255).astype(np.uint8)).save(
        os.path.join(OUT, f'{name}_rough.webp'), quality=q, method=6)
    print('saved', name)


# ---------------------------------------------------------------- wood
def wood_fields(h, w, rings=46, knots=7, seed=1):
    """Return (latewood, fibre, knot_mask, macro) fields for a flat-sawn conifer surface.
    u (x axis, width w) runs along the grain."""
    rng = np.random.default_rng(seed)
    y = np.arange(h)[:, None] / h
    x = np.arange(w)[None, :] / w
    # Flat-sawn board: growth rings are cylinders around the pith, cut by the board plane.
    # z = depth of the plane under the pith, yc = pith position across the board; both drift
    # slowly along the grain, which produces the typical cathedral arches.
    zc = 0.035 + 0.025 * (fnoise(1, w, 2.0, 1, 2.4, seed + 7) * 0.5 + 0.5)
    yc = 0.08 * fnoise(1, w, 1.5, 1, 2.4, seed + 8)
    arches = 2  # arch systems per texture height (keeps the map periodic across the grain)
    dy = np.sin(2 * np.pi * arches * (y - yc)) / (2 * np.pi * arches)
    d1 = fnoise(h, w, 1.2, 3, 2.4, seed + 1)
    d2 = fnoise(h, w, 5, 14, 2.2, seed + 2)
    radius = np.sqrt(zc ** 2 + dy ** 2)
    phase = radius * rings + d1 * 0.55 + d2 * 0.1

    # knots: displace the growth rings around them and add a dark core
    knot = np.zeros((h, w))
    for _ in range(knots):
        ky, kx = rng.uniform(0, 1), rng.uniform(0, 1)
        r = rng.uniform(0.01, 0.022)
        dyk = (y - ky + 0.5) % 1 - 0.5
        dxk = ((x - kx + 0.5) % 1 - 0.5) * (w / h)
        dist = np.sqrt((dxk / 1.15) ** 2 + dyk ** 2)
        phase += np.exp(-(dist / (r * 5)) ** 2) * rng.uniform(1.0, 2.0)
        core = smoothstep(r, r * 0.6, dist)
        ring = smoothstep(r * 1.25, r, dist) * (1 - core) * 0.6
        knot = np.maximum(knot, np.maximum(core, ring))

    t = phase % 1.0
    # sharp latewood band at the end of each ring
    late = smoothstep(0.55, 0.88, t) * (1 - smoothstep(0.9, 1.0, t))
    late = late ** 0.9
    fibre = fnoise(h, w, 30, 420, 1.6, seed + 4) * 0.6 + fnoise(h, w, 120, 900, 1.4, seed + 5) * 0.4
    macro = fnoise(h, w, 1.2, 2.0, 2.2, seed + 6)
    return late, fibre, knot, macro


def colorize_wood(late, fibre, knot, macro, early_rgb, late_rgb, knot_rgb, contrast=1.0, var=0.06):
    e = np.array(early_rgb, float)[None, None] / 255
    l = np.array(late_rgb, float)[None, None] / 255
    k = np.array(knot_rgb, float)[None, None] / 255
    lw = (late * contrast).clip(0, 1)[..., None]
    c = e * (1 - lw) + l * lw
    c *= (1 + fibre[..., None] * 0.035 + macro[..., None] * var)
    kk = knot[..., None]
    c = c * (1 - kk) + k * kk
    return (c.clip(0, 1) ** 1.0 * 255).astype(np.uint8)


def gen_wood_set():
    h, w = 1024, 2048
    late, fibre, knot, macro = wood_fields(h, w, rings=170, knots=5, seed=11)
    height = -late * 0.55 + fibre * 0.18 - knot * 0.6
    height = height - height.mean()
    nrm = normal_from_height(height, 2.4)

    species = {
        # name: early, late, knot, contrast, macro variation, roughness base
        'pine': ((236, 205, 158), (196, 146, 92), (112, 70, 38), 0.85, 0.07, 0.62),
        'larch': ((222, 166, 112), (168, 98, 55), (96, 52, 28), 0.95, 0.08, 0.6),
        'thermo': ((150, 98, 62), (92, 56, 33), (52, 30, 18), 0.9, 0.08, 0.58),
        'graphite': ((58, 58, 60), (44, 44, 46), (40, 40, 42), 0.45, 0.03, 0.7),
    }
    for name, (e, l, k, con, var, rb) in species.items():
        col = colorize_wood(late, fibre, knot, macro, e, l, k, con, var)
        rough = rb + late * 0.08 - knot * 0.1 + fibre * 0.02
        save('wood_' + name, col, nrm, rough)

    # softer, finer grained woods for sauna benches (aspen, linden, abachi, canadian cedar)
    h2, w2 = 512, 1024
    late, fibre, knot, macro = wood_fields(h2, w2, rings=120, knots=0, seed=21)
    height = -late * 0.25 + fibre * 0.2
    nrm = normal_from_height(height - height.mean(), 1.6)
    bench = {
        'aspen': ((232, 222, 196), (208, 194, 160), (150, 130, 100), 0.5, 0.04, 0.7),
        'linden': ((238, 220, 178), (214, 188, 140), (150, 120, 80), 0.45, 0.04, 0.68),
        'abachi': ((242, 226, 170), (226, 204, 140), (170, 140, 90), 0.35, 0.03, 0.66),
        'cedar': ((196, 126, 86), (150, 84, 54), (90, 50, 30), 0.8, 0.09, 0.62),
    }
    for name, (e, l, k, con, var, rb) in bench.items():
        col = colorize_wood(late, fibre, knot, macro, e, l, k, con, var)
        rough = rb + late * 0.05 + fibre * 0.02
        save('bench_' + name, col, nrm, rough)

    # composite (WPC) decking: brushed, low-contrast streaks
    h3, w3 = 512, 2048
    streak = fnoise(h3, w3, 4, 160, 1.6, 31) * 0.6 + fnoise(h3, w3, 40, 500, 1.3, 32) * 0.4
    mac = fnoise(h3, w3, 2, 3, 2, 33)
    for name, base in {'wpc_graphite': (78, 76, 74), 'wpc_teak': (142, 102, 70)}.items():
        b = np.array(base, float)[None, None] / 255
        col = (b * (1 + streak[..., None] * 0.08 + mac[..., None] * 0.04)).clip(0, 1)
        save(name, (col * 255).astype(np.uint8), normal_from_height(streak * 0.4, 1.4),
             0.55 + streak * 0.05)


# ---------------------------------------------------------------- end grain (firewood)
def gen_endgrain():
    """2x2 atlas of log cross-sections (birch, pine, aspen, birch)."""
    s = 512
    atlas = np.zeros((s * 2, s * 2, 3), np.uint8)
    atlas_h = np.zeros((s * 2, s * 2))
    variants = [
        ((214, 176, 128), (178, 128, 82), (232, 228, 220), 0.86),   # birch: pale wood, white bark
        ((222, 172, 112), (170, 108, 60), (98, 62, 40), 0.9),       # pine: orange wood, brown bark
        ((226, 200, 160), (196, 162, 118), (120, 116, 100), 0.9),   # aspen
        ((206, 160, 110), (160, 112, 70), (226, 222, 212), 0.88),   # birch, drier
    ]
    yy, xx = np.mgrid[0:s, 0:s] / s - 0.5
    for i, (wood, ring, bark, rb) in enumerate(variants):
        rng = np.random.default_rng(100 + i)
        cx, cy = rng.uniform(-0.06, 0.06, 2)
        dx, dy = xx - cx, yy - cy
        r = np.sqrt(dx ** 2 + dy ** 2)
        ang = np.arctan2(dy, dx)
        n1 = fnoise(s, s, 6, 6, 2, 200 + i)
        rr = r * (1 + 0.04 * n1) + 0.006 * np.sin(ang * 5 + rng.uniform(0, 6))
        rings = (rr * rng.uniform(55, 80)) % 1.0
        late = smoothstep(0.7, 0.92, rings) * (1 - smoothstep(0.94, 1, rings))
        w = np.array(wood, float) / 255
        rc = np.array(ring, float) / 255
        col = w[None, None] * (1 - late[..., None] * 0.6) + rc[None, None] * late[..., None] * 0.6
        # heart darkening + saw marks
        col *= (1 - 0.18 * smoothstep(0.25, 0.0, r))[..., None]
        saw = fnoise(s, s, 1, 40, 1.5, 300 + i)
        col *= (1 + 0.05 * saw)[..., None]
        # radial drying cracks
        cracks = np.zeros((s, s))
        for _ in range(rng.integers(2, 5)):
            a0 = rng.uniform(-np.pi, np.pi)
            da = np.abs(((ang - a0 + np.pi) % (2 * np.pi)) - np.pi)
            length = rng.uniform(0.15, 0.4)
            width = 0.012 * (1 - smoothstep(0.42 - length, 0.42, r))
            cracks = np.maximum(cracks, smoothstep(width, 0, da * r) * smoothstep(0.42 - length, 0.44, r))
        col *= (1 - 0.75 * cracks)[..., None]
        # bark ring (r from 0.42 to 0.5)
        b = smoothstep(0.415, 0.43, r)
        bc = np.array(bark, float) / 255 * (1 + 0.15 * fnoise(s, s, 30, 30, 1.5, 400 + i))[..., None]
        col = col * (1 - b[..., None]) + bc * b[..., None]
        # cambium dark line
        cam = smoothstep(0.012, 0, np.abs(r - 0.418))
        col *= (1 - 0.45 * cam)[..., None]
        col = (col.clip(0, 1) * 255).astype(np.uint8)
        hgt = -late * 0.4 - cracks * 2.0 + b * 0.8 * (1 + 0.5 * fnoise(s, s, 40, 40, 1.4, 500 + i)) + saw * 0.15
        oy, ox = (i // 2) * s, (i % 2) * s
        atlas[oy:oy + s, ox:ox + s] = col
        atlas_h[oy:oy + s, ox:ox + s] = hgt
    rough = 0.8 - 0.05 * (atlas_h > 0)
    save('endgrain', atlas, normal_from_height(atlas_h, 3.0), rough + np.zeros_like(atlas_h))


# ---------------------------------------------------------------- gravel
def gen_gravel():
    """Rounded river/granite pebbles (5-20 mm fraction) on a dark bed of fines."""
    s = 1024
    rng = np.random.default_rng(7)
    g = 22  # jittered grid -> evenly packed stones
    gx, gy = np.meshgrid(np.arange(0, s, g), np.arange(0, s, g))
    pts = np.stack([gx.ravel(), gy.ravel()], 1) + rng.uniform(0, g, (gx.size, 2))
    small = rng.uniform(0, s, (2200, 2))
    pts = np.concatenate([pts, small])
    n = len(pts)
    offs = [np.array([dx, dy]) * s for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
    tiles = np.concatenate([pts + o for o in offs])
    tree = cKDTree(tiles)
    rad = np.concatenate([g * rng.uniform(0.5, 0.72, gx.size), g * rng.uniform(0.18, 0.32, 2200)])
    theta = rng.uniform(0, np.pi, n)
    aspect = rng.uniform(1.0, 1.6, n)
    yy, xx = np.mgrid[0:s, 0:s]
    q = np.stack([xx.ravel() + 0.5, yy.ravel() + 0.5], 1)
    d, idx = tree.query(q, k=8)
    best = np.zeros(q.shape[0])
    owner = np.zeros(q.shape[0], int)
    for j in range(8):
        i = idx[:, j] % n
        v = q - tiles[idx[:, j]]
        c, sn = np.cos(theta[i]), np.sin(theta[i])
        lx = (v[:, 0] * c + v[:, 1] * sn) * aspect[i]
        ly = -v[:, 0] * sn + v[:, 1] * c
        rr = np.sqrt(lx ** 2 + ly ** 2) / (rad[i] * np.sqrt(aspect[i]))
        hh = np.sqrt(np.clip(1 - rr ** 2, 0, 1)) * (0.6 + 0.4 * (rad[i] / rad.max()))
        upd = hh > best
        best[upd] = hh[upd]
        owner[upd] = i[upd]
    hgt = best.reshape(s, s)
    cell = owner.reshape(s, s)
    mask = (hgt > 0).astype(float)
    shades = rng.uniform(0.42, 0.86, n)
    warm = rng.normal(0, 0.025, n)
    base = np.array([0.80, 0.79, 0.76])
    col = shades[cell][..., None] * (base[None, None] + warm[cell][..., None] * np.array([1.0, 0.6, 0.1]))
    speck = fnoise(s, s, 260, 260, 1.1, 9)
    col *= (1 + 0.07 * speck)[..., None]
    col *= (0.55 + 0.45 * np.sqrt(hgt))[..., None]  # contact darkening at the rims
    bed = np.array([0.26, 0.25, 0.23]) * (1 + 0.15 * fnoise(s, s, 120, 120, 1.3, 10))[..., None]
    col = col * mask[..., None] + bed * (1 - mask[..., None])
    col = (col.clip(0, 1) * 255).astype(np.uint8)
    rough = 0.75 - hgt * 0.12 + (1 - mask) * 0.15
    save('gravel', col, normal_from_height(hgt * 5 + speck * 0.08, 1.6), rough)


if __name__ == '__main__':
    gen_wood_set()
    gen_endgrain()
    gen_gravel()
