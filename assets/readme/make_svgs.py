"""Generates the animated SVGs used in the README (pure SVG + SMIL, no JavaScript,
so GitHub renders them). Run:  python assets/readme/make_svgs.py
"""

import math
import random
from pathlib import Path

OUT = Path(__file__).parent
GREEN, LIME, CYAN, VIOLET, INK, MUTED = "#76b900", "#b6f23c", "#22d3ee", "#a78bfa", "#07080a", "#8b8d98"
SANS = "'Segoe UI', Inter, Helvetica, Arial, sans-serif"
MONO = "'JetBrains Mono', Consolas, 'Courier New', monospace"


def svg(w, h, body, defs=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="{SANS}">'
        f"<defs>{defs}</defs>{body}</svg>"
    )


def loop(attr, values, key_times, dur, extra=""):
    """One SMIL animation on a shared looping timeline."""
    return (
        f'<animate attributeName="{attr}" values="{values}" keyTimes="{key_times}" '
        f'dur="{dur}s" repeatCount="indefinite" {extra}/>'
    )


def appear(start, end_hold, dur, fade=0.04):
    """Opacity 0 -> 1 at `start`, back to 0 at `end_hold` (fractions of the loop)."""
    a, b = start, min(start + fade, end_hold)
    c, d = end_hold, min(end_hold + fade, 1)
    return loop("opacity", "0;0;1;1;0;0", f"0;{a:.3f};{b:.3f};{c:.3f};{d:.3f};1", dur)


def bars(cx, cy, n, gap, width, color, seed, max_h=60, min_h=8, opacity=1):
    rnd = random.Random(seed)
    out = []
    x0 = cx - (n - 1) * gap / 2
    for i in range(n):
        x = x0 + i * gap
        hs = [rnd.randint(min_h, max_h) for _ in range(4)] + [min_h + 4]
        hs = [hs[-1]] + hs[:-1] + [hs[-1]]
        hv = ";".join(str(h) for h in hs)
        yv = ";".join(str(cy - h / 2) for h in hs)
        d = round(rnd.uniform(0.9, 1.5), 2)
        out.append(
            f'<rect x="{x - width / 2}" y="{cy - 6}" width="{width}" height="12" rx="{width / 2}" fill="{color}" opacity="{opacity}">'
            f'<animate attributeName="height" values="{hv}" dur="{d}s" repeatCount="indefinite"/>'
            f'<animate attributeName="y" values="{yv}" dur="{d}s" repeatCount="indefinite"/></rect>'
        )
    return "".join(out)


def panel(w, h, glow_x="30%", glow_color=GREEN):
    return (
        f'<rect width="{w}" height="{h}" rx="26" fill="{INK}"/>'
        f'<rect width="{w}" height="{h}" rx="26" fill="url(#dots)" opacity=".5"/>'
        f'<rect width="{w}" height="{h}" rx="26" fill="url(#glow)"/>'
        f'<rect x=".5" y=".5" width="{w - 1}" height="{h - 1}" rx="26" fill="none" stroke="#ffffff" stroke-opacity=".08"/>'
    )


def base_defs(glow_x="30%", glow_y="50%", glow_color=GREEN):
    return (
        f'<radialGradient id="glow" cx="{glow_x}" cy="{glow_y}" r="65%">'
        f'<stop offset="0" stop-color="{glow_color}" stop-opacity=".28"/>'
        f'<stop offset="1" stop-color="{glow_color}" stop-opacity="0"/></radialGradient>'
        '<pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">'
        '<circle cx="2" cy="2" r="1.1" fill="#ffffff" fill-opacity=".09"/></pattern>'
        f'<radialGradient id="orb" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="{LIME}"/>'
        f'<stop offset=".55" stop-color="{GREEN}"/><stop offset="1" stop-color="#1f3600"/></radialGradient>'
        f'<linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaffc2"/>'
        f'<stop offset="1" stop-color="#ffffff"/></linearGradient>'
    )


# ---------------------------------------------------------------- hero
def hero():
    W, H = 1200, 400
    cx, cy = 290, 200
    ripples = "".join(
        f'<circle cx="{cx}" cy="{cy}" r="78" fill="none" stroke="{GREEN}" stroke-width="2" opacity="0">'
        f'<animate attributeName="r" values="78;190" dur="3.6s" begin="{b}s" repeatCount="indefinite"/>'
        f'<animate attributeName="opacity" values=".7;0" dur="3.6s" begin="{b}s" repeatCount="indefinite"/></circle>'
        for b in (0, 1.2, 2.4)
    )
    orb = (
        f'<circle cx="{cx}" cy="{cy}" r="110" fill="{GREEN}" opacity=".12">'
        f'<animate attributeName="r" values="104;120;104" dur="2.4s" repeatCount="indefinite"/></circle>'
        f'<circle cx="{cx}" cy="{cy}" r="80" fill="url(#orb)">'
        f'<animate attributeName="r" values="78;84;78" dur="1.6s" repeatCount="indefinite"/></circle>'
        + bars(cx, cy, 9, 12, 6, "#0b1400", seed=3, max_h=64, opacity=0.85)
    )
    chips = ["brain-dump", "meeting notes", "navigation", "co-pilot", "reminders", "focus"]
    x = 520
    chip_svg = ""
    for i, c in enumerate(chips):
        w = 22 + len(c) * 10.5
        chip_svg += (
            f'<g opacity="0"><animate attributeName="opacity" from="0" to="1" begin="{0.6 + i * 0.18}s" dur=".5s" fill="freeze"/>'
            f'<rect x="{x}" y="292" width="{w}" height="38" rx="19" fill="#ffffff" fill-opacity=".05" stroke="{GREEN}" stroke-opacity=".45"/>'
            f'<text x="{x + w / 2}" y="317" text-anchor="middle" font-family="{MONO}" font-size="16" fill="#d6f5a3">{c}</text></g>'
        )
        x += w + 12
    body = (
        panel(W, H)
        + ripples
        + orb
        + f'<text x="516" y="178" font-size="128" font-weight="800" fill="#f3f4f6" letter-spacing="-4">Vox<tspan fill="{GREEN}">.</tspan></text>'
        + f'<text x="522" y="232" font-size="31" fill="#c9cbd3">Talk to your day. Vox does the rest.</text>'
        + f'<text x="524" y="268" font-family="{MONO}" font-size="15" letter-spacing="3" fill="{GREEN}">NVIDIA NEMOTRON 3 · NEBIUS TOKEN FACTORY</text>'
        + chip_svg
        + f'<g transform="translate(1040 56)"><circle r="6" fill="#f43f5e"><animate attributeName="opacity" values="1;.2;1" dur="1.2s" repeatCount="indefinite"/></circle>'
        + f'<text x="16" y="5" font-family="{MONO}" font-size="14" fill="{MUTED}" letter-spacing="2">LISTENING</text></g>'
    )
    return svg(W, H, body, base_defs("24%", "50%"))


# ---------------------------------------------------------------- brain-dump
def braindump():
    W, H, T = 1200, 440, 11  # T = loop length in seconds
    fs, cw, lx, ly0, lh = 21, 12.6, 56, 132, 40
    lines = [
        "“Ok so I need to finish the hackathon video",
        " by Friday, oh and call my mom this weekend,",
        " and the dentist on Monday, no wait cancel that,",
        " and remind me to buy coffee.”",
    ]
    end_fade = 0.93
    clips, texts = "", ""
    for i, line in enumerate(lines):
        y = ly0 + i * lh
        width = len(line) * cw + 4
        s, e = 0.03 + i * 0.09, 0.03 + (i + 1) * 0.09
        clips += (
            f'<clipPath id="type{i}"><rect x="{lx}" y="{y - 28}" height="40" width="0">'
            + loop("width", f"0;0;{width};{width};{width}", f"0;{s:.3f};{e:.3f};{end_fade};1", T)
            + "</rect></clipPath>"
        )
        if i == 2:
            pre, cancel, post = " and ", "the dentist on Monday", ", no wait cancel that,"
            x1 = lx + len(pre) * cw
            x2 = x1 + len(cancel) * cw
            texts += (
                f'<text y="{y}" font-family="{MONO}" font-size="{fs}" fill="#e5e7eb" clip-path="url(#type{i})">'
                f'<tspan x="{lx}" textLength="{len(pre) * cw:.1f}" lengthAdjust="spacingAndGlyphs">{pre}</tspan>'
                f'<tspan x="{x1}" textLength="{len(cancel) * cw:.1f}" lengthAdjust="spacingAndGlyphs">{cancel}'
                + loop("fill", "#e5e7eb;#e5e7eb;#fb7185;#fb7185;#e5e7eb", f"0;0.40;0.42;{end_fade};1", T)
                + f'</tspan><tspan x="{x2}" textLength="{len(post) * cw:.1f}" lengthAdjust="spacingAndGlyphs" fill="{LIME}">{post}</tspan></text>'
                f'<line x1="{x1}" y1="{y - 7}" x2="{x1}" y2="{y - 7}" stroke="#fb7185" stroke-width="3" stroke-linecap="round">'
                + loop("x2", f"{x1};{x1};{x2};{x2};{x1}", f"0;0.40;0.45;{end_fade};1", T)
                + "</line>"
            )
        else:
            texts += (
                f'<text x="{lx}" y="{y}" font-family="{MONO}" font-size="{fs}" fill="#e5e7eb" '
                f'textLength="{len(line) * cw:.1f}" lengthAdjust="spacingAndGlyphs" clip-path="url(#type{i})">{line}</text>'
            )
    caret = (
        f'<rect x="{lx}" y="{ly0 + 3 * lh + 30}" width="10" height="3" fill="{GREEN}">'
        f'<animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/></rect>'
    )
    left = (
        f'<text x="56" y="76" font-family="{MONO}" font-size="14" letter-spacing="3" fill="{MUTED}">YOU SAY</text>'
        + f'<g transform="translate(170 71)">{bars(0, 0, 7, 8, 4, GREEN, seed=7, max_h=22, min_h=4)}</g>'
        + texts
        + caret
    )
    # Nemotron chip in the middle
    mid = (
        f'<g opacity="0">{appear(0.47, end_fade, T)}'
        f'<path d="M 668 235 L 712 235" stroke="{GREEN}" stroke-width="3" stroke-dasharray="6 6">'
        f'<animate attributeName="stroke-dashoffset" values="24;0" dur=".6s" repeatCount="indefinite"/></path>'
        f'<path d="M 712 227 L 724 235 L 712 243 Z" fill="{GREEN}"/>'
        f'<rect x="560" y="268" width="182" height="54" rx="14" fill="#0f1a00" stroke="{GREEN}" stroke-opacity=".6"/>'
        f'<text x="651" y="291" text-anchor="middle" font-size="15" font-weight="700" fill="{LIME}">Nemotron 3 Super</text>'
        f'<text x="651" y="311" text-anchor="middle" font-family="{MONO}" font-size="13" fill="{MUTED}">2.1 s · 3 actions</text></g>'
    )
    tasks = [("Finish the hackathon video", "Friday", False), ("Call mom", "This weekend", False), ("Buy coffee", "No date", False)]
    cards = f'<text x="760" y="76" font-family="{MONO}" font-size="14" letter-spacing="3" fill="{MUTED}">VOX HEARS</text>'
    for i, (title, when, _) in enumerate(tasks):
        y = 104 + i * 86
        s = 0.53 + i * 0.07
        cards += (
            f'<g opacity="0">{appear(s, end_fade, T)}'
            f'<animateTransform attributeName="transform" type="translate" values="40 0;40 0;0 0;0 0;0 0" '
            f'keyTimes="0;{s:.3f};{s + 0.05:.3f};{end_fade};1" dur="{T}s" repeatCount="indefinite"/>'
            f'<rect x="760" y="{y}" width="390" height="70" rx="16" fill="#ffffff" fill-opacity=".04" stroke="{GREEN}" stroke-opacity=".5"/>'
            f'<circle cx="795" cy="{y + 35}" r="11" fill="none" stroke="{GREEN}" stroke-width="2.5"/>'
            f'<text x="822" y="{y + 32}" font-size="19" font-weight="600" fill="#f3f4f6">{title}</text>'
            f'<text x="822" y="{y + 54}" font-family="{MONO}" font-size="13" fill="{LIME}">{when}</text></g>'
        )
    y = 104 + 3 * 86
    cards += (
        f'<g opacity="0">{appear(0.78, end_fade, T)}'
        f'<text x="764" y="{y + 26}" font-family="{MONO}" font-size="15" fill="#fb7185">✕ dentist: you cancelled it, so it never became a task</text></g>'
    )
    body = panel(W, H) + left + mid + cards
    return svg(W, H, body, base_defs("50%", "40%") + clips)


# ---------------------------------------------------------------- model router
def router():
    W, H = 1200, 400
    src, rt, out = (140, 200), (400, 200), (1085, 200)
    lanes = [
        ("Nemotron 3 Nano", "30B-A3B · everyday commands", "~0.5 s", 90, GREEN, 2.2),
        ("Nemotron 3 Super", "120B-A12B · brain-dumps · meetings", "~2 s", 200, CYAN, 3.4),
        ("Nemotron 3 Ultra", "550B-A55B · plans and goals", "~3.5 s", 310, VIOLET, 4.6),
    ]
    body = panel(W, H, glow_color=CYAN)
    paths = ""
    for i, (name, sub, lat, y, col, dur) in enumerate(lanes):
        d = f"M {src[0]} {src[1]} L {rt[0]} {rt[1]} C 480 {rt[1]} 480 {y} 560 {y} L 880 {y} C 960 {y} 960 {out[1]} {out[0]} {out[1]}"
        paths += f'<path id="lane{i}" d="{d}" fill="none" stroke="{col}" stroke-opacity=".28" stroke-width="2"/>'
        body += (
            f'<rect x="560" y="{y - 36}" width="320" height="72" rx="16" fill="{INK}" stroke="{col}" stroke-opacity=".7"/>'
            f'<text x="580" y="{y - 6}" font-size="18" font-weight="700" fill="#f3f4f6">{name}</text>'
            f'<text x="580" y="{y + 17}" font-family="{MONO}" font-size="12" fill="{MUTED}">{sub}</text>'
            f'<text x="862" y="{y - 6}" text-anchor="end" font-family="{MONO}" font-size="13" fill="{col}">{lat}</text>'
        )
        for k in range(2):
            paths += (
                f'<circle r="7" fill="{col}"><animateMotion dur="{dur}s" begin="{k * dur / 2}s" repeatCount="indefinite" rotate="auto">'
                f'<mpath xlink:href="#lane{i}"/></animateMotion>'
                f'<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.05;.9;1" dur="{dur}s" begin="{k * dur / 2}s" repeatCount="indefinite"/></circle>'
            )
    body = body.replace(panel(W, H, glow_color=CYAN), panel(W, H, glow_color=CYAN) + paths, 1)
    body += (
        f'<circle cx="{src[0]}" cy="{src[1]}" r="46" fill="url(#orb)"/>'
        + bars(src[0], src[1], 5, 11, 5, "#0b1400", seed=11, max_h=40)
        + f'<text x="{src[0]}" y="{src[1] + 76}" text-anchor="middle" font-size="16" fill="#e5e7eb">your words</text>'
        + f'<g transform="translate({rt[0]} {rt[1]})"><rect x="-44" y="-44" width="88" height="88" rx="18" transform="rotate(45)" fill="{INK}" stroke="#ffffff" stroke-opacity=".35" stroke-width="2"/>'
        + f'<text y="-2" text-anchor="middle" font-size="15" font-weight="700" fill="#f3f4f6">router</text>'
        + f'<text y="17" text-anchor="middle" font-family="{MONO}" font-size="11" fill="{MUTED}">pick_tier()</text></g>'
        + f'<g transform="translate({out[0]} {out[1]})"><rect x="-70" y="-46" width="140" height="92" rx="18" fill="{INK}" stroke="{GREEN}" stroke-opacity=".7"/>'
        + f'<text y="-12" text-anchor="middle" font-size="16" font-weight="700" fill="#f3f4f6">validated</text>'
        + f'<text y="8" text-anchor="middle" font-size="16" font-weight="700" fill="#f3f4f6">actions</text>'
        + f'<text y="30" text-anchor="middle" font-family="{MONO}" font-size="11" fill="{MUTED}">→ SQLite · undo</text></g>'
        + f'<text x="40" y="48" font-family="{MONO}" font-size="14" letter-spacing="3" fill="{MUTED}">EVERY REQUEST GOES TO THE RIGHT-SIZED NEMOTRON</text>'
    )
    return svg(W, H, body, base_defs("50%", "50%", CYAN))


# ---------------------------------------------------------------- navigation + co-pilot
def navigation():
    W, H, T = 1200, 500, 14
    rnd = random.Random(5)
    streets = ""
    for _ in range(26):
        if rnd.random() < 0.5:
            y = rnd.randint(70, 470)
            streets += f'<path d="M 30 {y} L 760 {y + rnd.randint(-60, 60)}" stroke="#ffffff" stroke-opacity=".07" stroke-width="{rnd.choice([2, 3, 6])}"/>'
        else:
            x = rnd.randint(40, 750)
            streets += f'<path d="M {x} 60 L {x + rnd.randint(-80, 80)} 480" stroke="#ffffff" stroke-opacity=".07" stroke-width="{rnd.choice([2, 3, 6])}"/>'
    park = '<rect x="520" y="300" width="160" height="110" rx="20" fill="#14532d" opacity=".35"/>'
    route = "M 90 440 L 210 440 L 260 360 L 420 330 L 450 250 L 610 220 L 640 150 L 710 120"
    drawn = (
        f'<path d="{route}" fill="none" stroke="{GREEN}" stroke-width="16" stroke-opacity=".18" stroke-linejoin="round"/>'
        f'<path id="route" d="{route}" fill="none" stroke="{GREEN}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" '
        f'pathLength="1" stroke-dasharray="1" stroke-dashoffset="1">'
        + loop("stroke-dashoffset", "1;0;0;1", "0;0.12;0.96;1", T)
        + "</path>"
    )
    pin = (
        f'<circle cx="710" cy="120" r="10" fill="{GREEN}" stroke="#fff" stroke-width="3"/>'
        f'<circle cx="710" cy="120" r="10" fill="none" stroke="{GREEN}" stroke-width="2">'
        f'<animate attributeName="r" values="10;30" dur="1.6s" repeatCount="indefinite"/>'
        f'<animate attributeName="opacity" values=".8;0" dur="1.6s" repeatCount="indefinite"/></circle>'
        f'<text x="698" y="152" text-anchor="end" font-size="15" font-weight="700" fill="#e5e7eb">Gare Rabat Ville</text>'
    )
    car = (
        f'<g><circle r="18" fill="{CYAN}" opacity=".25"><animate attributeName="r" values="12;24;12" dur="1.4s" repeatCount="indefinite"/></circle>'
        f'<circle r="10" fill="{CYAN}" stroke="#fff" stroke-width="3"/>'
        f'<animateMotion dur="{T}s" repeatCount="indefinite" keyPoints="0;0;1;1" keyTimes="0;0.16;0.86;1" calcMode="linear"><mpath xlink:href="#route"/></animateMotion></g>'
    )
    # turn banner: three instructions, one after another
    steps = [("320 m", "Turn right onto Avenue Mohammed V", 0.16, 0.40), ("90 m", "At the roundabout, take exit 2", 0.40, 0.64), ("40 m", "Your destination is on the left", 0.64, 0.86)]
    banner = f'<rect x="60" y="24" width="660" height="66" rx="20" fill="{GREEN}"/>'
    banner += f'<path d="M 92 72 L 92 52 Q 92 44 100 44 L 116 44 M 108 36 L 116 44 L 108 52" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'
    for dist, text, a, b in steps:
        banner += (
            f'<g opacity="0">{loop("opacity", "0;0;1;1;0;0", f"0;{a:.3f};{a + 0.01:.3f};{b - 0.01:.3f};{b:.3f};1", T)}'
            f'<text x="140" y="56" font-size="26" font-weight="800" fill="{INK}">{dist}</text>'
            f'<text x="140" y="79" font-size="16" font-weight="600" fill="{INK}">{text}</text></g>'
        )
    arrived = (
        f'<g opacity="0">{loop("opacity", "0;0;1;1;0", "0;0.86;0.87;0.96;1", T)}'
        f'<rect x="60" y="24" width="660" height="66" rx="20" fill="{GREEN}"/>'
        f'<text x="92" y="66" font-size="26" font-weight="800" fill="{INK}">You\'ve arrived. Nice drive!</text></g>'
    )
    eq = "".join(
        f'<rect x="{96 + i * 6}" y="456" width="4" height="10" rx="2" fill="{GREEN}">'
        f'<animate attributeName="height" values="4;14;6;12;4" dur="{0.8 + i * 0.17:.2f}s" repeatCount="indefinite"/>'
        f'<animate attributeName="y" values="463;453;461;455;463" dur="{0.8 + i * 0.17:.2f}s" repeatCount="indefinite"/></rect>'
        for i in range(4)
    )
    bar = (
        f'<rect x="60" y="428" width="660" height="56" rx="18" fill="#0d0e12" stroke="#ffffff" stroke-opacity=".1"/>'
        + eq
        + f'<text x="130" y="466" font-family="{MONO}" font-size="13" fill="{MUTED}">road mix</text>'
        + f'<text x="700" y="464" text-anchor="end" font-size="22" font-weight="800" fill="{GREEN}">6 min<tspan font-size="14" font-weight="400" fill="{MUTED}">  ·  3.9 km</tspan></text>'
    )
    # co-pilot chat, real replies from Nemotron Nano
    chat = [
        ("vox", "Off to the station? Where is the train taking you today?", 0.22),
        ("you", "Fès, to see my family.", 0.42),
        ("vox", "Nice! How long will you stay in Fès?", 0.56),
        ("you", "Just the weekend.", 0.70),
    ]
    talk = f'<text x="800" y="60" font-family="{MONO}" font-size="14" letter-spacing="3" fill="{MUTED}">CO-PILOT · NEMOTRON NANO</text>'
    y = 86
    for who, text, at in chat:
        lines = [text] if len(text) < 34 else [text[: text.rfind(" ", 0, 34)], text[text.rfind(" ", 0, 34) + 1 :]]
        h = 30 + 22 * len(lines)
        is_vox = who == "vox"
        x = 800 if is_vox else 1150 - 300
        fill = "#0f1a00" if is_vox else "#1d1f26"
        stroke = GREEN if is_vox else "#ffffff"
        bubble = f'<rect x="{x}" y="{y}" width="300" height="{h}" rx="18" fill="{fill}" stroke="{stroke}" stroke-opacity=".45"/>'
        for j, ln in enumerate(lines):
            bubble += f'<text x="{x + 18}" y="{y + 30 + j * 22}" font-size="16" fill="#f3f4f6">{ln}</text>'
        label = "Vox" if is_vox else "you"
        bubble += f'<text x="{x + (18 if is_vox else 282)}" y="{y + h + 18}" text-anchor="{"start" if is_vox else "end"}" font-family="{MONO}" font-size="11" fill="{MUTED}">{label}</text>'
        talk += f'<g opacity="0">{appear(at, 0.95, T)}{bubble}</g>'
        y += h + 34
    body = panel(W, H, glow_color=CYAN) + streets + park + drawn + pin + car + banner + arrived + bar + talk
    return svg(W, H, body, base_defs("30%", "55%", CYAN))


# ---------------------------------------------------------------- team
def team():
    W, H, T = 1200, 300, 6
    names = [("Aymane", "Idrissi Khamlichi"), ("Yassine", "Belaidi"), ("Nassime", "Gharib"), ("Yahya", "Dadsi")]
    body = panel(W, H)
    body += f'<text x="600" y="50" text-anchor="middle" font-family="{MONO}" font-size="14" letter-spacing="4" fill="{MUTED}">FOUR VOICES · ONE ASSISTANT</text>'
    for i, (first, last) in enumerate(names):
        cx = 150 + i * 300
        a = i / 4
        b = a + 0.25
        kt = f"0;{a:.3f};{a + 0.03:.3f};{b - 0.03:.3f};{b:.3f};1" if i else f"0;0.01;0.03;{b - 0.03:.3f};{b:.3f};1"
        body += (
            f'<circle cx="{cx}" cy="128" r="62" fill="none" stroke="{GREEN}" stroke-width="2" opacity="0">'
            + loop("opacity", "0;0;.9;.9;0;0", kt, T)
            + loop("r", "50;50;56;72;72;50", kt, T)
            + "</circle>"
            f'<circle cx="{cx}" cy="128" r="46" fill="url(#orb)" opacity=".35">'
            + loop("opacity", ".35;.35;1;1;.35;.35", kt, T)
            + "</circle>"
            + f'<g opacity=".25">{loop("opacity", ".25;.25;1;1;.25;.25", kt, T)}{bars(cx, 128, 5, 10, 5, "#0b1400", seed=20 + i, max_h=38)}</g>'
            + f'<text x="{cx}" y="222" text-anchor="middle" font-size="24" font-weight="800" fill="#f3f4f6">{first}</text>'
            + f'<text x="{cx}" y="250" text-anchor="middle" font-size="17" fill="{MUTED}">{last}</text>'
        )
    return svg(W, H, body, base_defs("50%", "45%"))


# ---------------------------------------------------------------- divider
def divider():
    W, H = 1200, 60

    def wave(phase, amp):
        pts = []
        for x in range(0, W + 1, 12):
            env = math.sin(math.pi * x / W)  # quiet at both ends
            y = 30 + amp * env * math.sin(x / 38 + phase) * math.cos(x / 97 - phase)
            pts.append(f"{x} {y:.1f}")
        return "M " + " L ".join(pts)

    frames = [wave(p, a) for p, a in [(0, 18), (1.2, 10), (2.4, 20), (3.6, 8), (0, 18)]]
    body = (
        f'<linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="{GREEN}" stop-opacity="0"/>'
        f'<stop offset=".5" stop-color="{LIME}"/><stop offset="1" stop-color="{CYAN}" stop-opacity="0"/></linearGradient>'
        f'<path d="{frames[0]}" fill="none" stroke="url(#fade)" stroke-width="3" stroke-linecap="round">'
        f'<animate attributeName="d" values="{";".join(frames)}" dur="4s" repeatCount="indefinite"/></path>'
    )
    return svg(W, H, body)


if __name__ == "__main__":
    for name, fn in [("hero", hero), ("braindump", braindump), ("router", router), ("navigation", navigation), ("team", team), ("divider", divider)]:
        (OUT / f"{name}.svg").write_text(fn(), encoding="utf-8")
        print("wrote", name)
