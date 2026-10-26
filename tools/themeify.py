#!/usr/bin/env python3
"""Rewrites every BLUE-ish colour literal in a stylesheet as hsl(calc(var(--hue) +/- d) ...), so one --hue variable
re-colours the whole UI (blue / red / yellow / purple themes). Gold, white, grey and red literals stay as they are."""
import re, sys, colorsys
HEX = re.compile(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
RGB = re.compile(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)')
def themed(r, g, b, a):
    h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255); H = h*360
    if not (185 <= H <= 262 and s >= 0.18): return None
    d = round(H - 220)
    hue = f"calc(var(--hue) {'+' if d >= 0 else '-'} {abs(d)})"
    sat = f"calc({round(s*100)}% * var(--sat))"
    alpha = f" / {a}" if a not in (None, '1', '1.0') else ""
    return f"hsl({hue} {sat} {round(l*100)}%{alpha})"
def sub_hex(m):
    x = m.group(1)
    if len(x) == 3: x = ''.join(c*2 for c in x)
    r, g, b = int(x[0:2], 16), int(x[2:4], 16), int(x[4:6], 16)
    a = None
    if len(x) == 8: a = str(round(int(x[6:8], 16)/255, 2))
    return themed(r, g, b, a) or m.group(0)
def sub_rgb(m):
    r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return themed(r, g, b, m.group(4)) or m.group(0)
for path in sys.argv[1:]:
    s = open(path).read(); n0 = len(HEX.findall(s)) + len(RGB.findall(s))
    s = RGB.sub(sub_rgb, s); s = HEX.sub(sub_hex, s)
    open(path, 'w').write(s); print(path, "colour literals:", n0, "-> themed:", s.count("var(--hue)"))
