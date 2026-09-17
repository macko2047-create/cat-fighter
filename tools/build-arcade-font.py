#!/usr/bin/env python3
"""Build Cat Arcade from original 5 x 7 drawings, using only Python's stdlib.

The output is a minimal OpenType font with TrueType outlines. Keeping the pixel
drawings here makes the font editable and reproducible without a font compiler.
"""

from datetime import datetime, timezone
from pathlib import Path
import struct


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets/fonts/cat-arcade.ttf"
EM = 800
CELL = 100
ADVANCE = 600

# Rows go from top to bottom. Lowercase deliberately uses the same arcade caps.
# These are original drawings for this project, not extracted from another font.
DRAWINGS = {
    " ": "00000/00000/00000/00000/00000/00000/00000",
    "A": "01110/11011/11011/11111/11011/11011/11011",
    "B": "11110/11011/11011/11110/11011/11011/11110",
    "C": "01111/11000/11000/11000/11000/11000/01111",
    "D": "11110/11011/11011/11011/11011/11011/11110",
    "E": "11111/11000/11000/11110/11000/11000/11111",
    "F": "11111/11000/11000/11110/11000/11000/11000",
    "G": "01111/11000/11000/11011/11011/11011/01111",
    "H": "11011/11011/11011/11111/11011/11011/11011",
    "I": "11111/00100/00100/00100/00100/00100/11111",
    "J": "00111/00011/00011/00011/00011/11011/01110",
    "K": "11011/11011/11110/11100/11110/11011/11011",
    "L": "11000/11000/11000/11000/11000/11000/11111",
    "M": "10001/11011/11111/10101/10001/10001/10001",
    "N": "10011/11011/11111/11111/11011/11001/11001",
    "O": "01110/11011/11011/11011/11011/11011/01110",
    "P": "11110/11011/11011/11110/11000/11000/11000",
    "Q": "01110/11011/11011/11011/11011/01110/00011",
    "R": "11110/11011/11011/11110/11110/11011/11011",
    "S": "01111/11000/11000/01110/00011/00011/11110",
    "T": "11111/00100/00100/00100/00100/00100/00100",
    "U": "11011/11011/11011/11011/11011/11011/01110",
    "V": "11011/11011/11011/11011/11011/01110/00100",
    "W": "10001/10001/10001/10101/11111/11011/10001",
    "X": "11011/11011/01110/00100/01110/11011/11011",
    "Y": "11011/11011/01110/00100/00100/00100/00100",
    "Z": "11111/00011/00110/01100/11000/11000/11111",
    "0": "01110/11011/11011/11011/11011/11011/01110",
    "1": "00100/01100/11100/01100/01100/01100/11111",
    "2": "11110/00011/00011/01110/11000/11000/11111",
    "3": "11110/00011/00011/01110/00011/00011/11110",
    "4": "11011/11011/11011/11111/00011/00011/00011",
    "5": "11111/11000/11000/11110/00011/00011/11110",
    "6": "01111/11000/11000/11110/11011/11011/01110",
    "7": "11111/00011/00011/00110/00110/01100/01100",
    "8": "01110/11011/11011/01110/11011/11011/01110",
    "9": "01110/11011/11011/01111/00011/00011/11110",
    ":": "00000/00100/00100/00000/00100/00100/00000",
    ".": "00000/00000/00000/00000/00000/01100/01100",
    ",": "00000/00000/00000/00000/00110/00110/00100",
    "/": "00001/00011/00110/00100/01100/11000/10000",
    "-": "00000/00000/00000/11111/00000/00000/00000",
    "+": "00000/00100/00100/11111/00100/00100/00000",
    "×": "00000/10001/01010/00100/01010/10001/00000",
    "·": "00000/00000/00000/00100/00000/00000/00000",
    "!": "01100/01100/01100/01100/01100/00000/01100",
    "?": "01110/11011/00011/00110/00100/00000/00100",
    "%": "11001/11011/00010/00100/01000/11011/10011",
    "=": "00000/00000/11111/00000/11111/00000/00000",
    "(": "00010/00100/01100/01100/01100/00100/00010",
    ")": "01000/00100/00110/00110/00110/00100/01000",
    "[": "01110/01100/01100/01100/01100/01100/01110",
    "]": "01110/00110/00110/00110/00110/00110/01110",
    "<": "00010/00100/01000/10000/01000/00100/00010",
    ">": "01000/00100/00010/00001/00010/00100/01000",
    "_": "00000/00000/00000/00000/00000/00000/11111",
    "|": "00100/00100/00100/00100/00100/00100/00100",
    "'": "00100/00100/00100/00000/00000/00000/00000",
    '"': "01010/01010/01010/00000/00000/00000/00000",
    "●": "00000/01110/11111/11111/11111/01110/00000",
    "▶": "10000/11000/11110/11111/11110/11000/10000",
    "★": "00100/00100/11111/01110/01110/11011/10001",
}


def pack(fmt, *values):
    return struct.pack(">" + fmt, *values)


def padded(data):
    return data + b"\0" * (-len(data) % 4)


def checksum(data):
    data = padded(data)
    return sum(struct.unpack(">" + "I" * (len(data) // 4), data)) & 0xFFFFFFFF


def glyph(drawing):
    """Convert connected horizontal pixel runs into clockwise rectangles."""
    rows = drawing.split("/")
    assert len(rows) == 7 and all(len(row) == 5 for row in rows)
    rectangles = []
    active = {}
    for row_index, row in enumerate(rows):
        runs = []
        column = 0
        while column < 5:
            if row[column] == "0":
                column += 1
                continue
            left = column
            while column < 5 and row[column] == "1":
                column += 1
            runs.append((left, column))
        next_active = {}
        for run in runs:
            if run in active:
                rect = active[run]
                rect[1] = (6 - row_index) * CELL
            else:
                rect = [50 + run[0] * CELL, (6 - row_index) * CELL,
                        50 + run[1] * CELL, (7 - row_index) * CELL]
                rectangles.append(rect)
            next_active[run] = rect
        active = next_active
    if not rectangles:
        return b"", 0, 0, 0, 0
    points = []
    for left, bottom, right, top in rectangles:
        points.extend([(left, bottom), (left, top), (right, top), (right, bottom)])
    xs, ys = zip(*points)
    data = pack("hhhhh", len(rectangles), min(xs), min(ys), max(xs), max(ys))
    data += pack("H" * len(rectangles), *(i * 4 + 3 for i in range(len(rectangles))))
    data += pack("H", 0)  # No TrueType hinting bytecode.
    data += bytes([1] * len(points))  # On-curve, signed 16-bit x/y deltas.
    for coordinates in (xs, ys):
        previous = 0
        for value in coordinates:
            data += pack("h", value - previous)
            previous = value
    return padded(data), len(points), len(rectangles), min(xs), max(xs)


def make_name():
    names = {
        0: "Copyright 2026 Cat Fighter contributors. Original glyph artwork.",
        1: "Cat Arcade",
        2: "Regular",
        3: "CatFighter:CatArcade:1.000",
        4: "Cat Arcade Regular",
        5: "Version 1.000",
        6: "CatArcade-Regular",
        8: "Cat Fighter",
    }
    records = bytearray()
    strings = bytearray()
    for name_id, text in sorted(names.items()):
        value = text.encode("utf-16-be")
        records += pack("6H", 3, 1, 0x0409, name_id, len(value), len(strings))
        strings += value
    return pack("3H", 0, len(names), 6 + len(records)) + records + strings


def make_cmap(mapping):
    # One segment per mapped BMP codepoint keeps this table simple and readable.
    pairs = sorted(mapping.items()) + [(0xFFFF, 0)]
    count = len(pairs)
    selector = count.bit_length() - 1
    search_range = 2 * (1 << selector)
    data = pack("7H", 4, 16 + count * 8, 0, count * 2,
                search_range, selector, count * 2 - search_range)
    data += pack("H" * count, *(codepoint for codepoint, _ in pairs))
    data += pack("H", 0)
    data += pack("H" * count, *(codepoint for codepoint, _ in pairs))
    data += pack("H" * count, *((gid - codepoint) & 0xFFFF for codepoint, gid in pairs))
    data += pack("H" * count, *([0] * count))
    # Unicode BMP + Windows Unicode BMP records share the same subtable.
    return pack("HHHHIHHI", 0, 2, 0, 3, 20, 3, 1, 20) + data


def build():
    drawings = ["11111/10001/10101/10101/10101/10001/11111"] + list(DRAWINGS.values())
    glyphs = [glyph(drawing) for drawing in drawings]
    mapping = {ord(char): index for index, char in enumerate(DRAWINGS, 1)}
    mapping.update({ord(char.lower()): mapping[ord(char)] for char in DRAWINGS if "A" <= char <= "Z"})
    mapping[0x00A0] = mapping[ord(" ")]
    mapping[0x2013] = mapping[ord("-")]
    mapping[0x2014] = mapping[ord("-")]
    offsets = [0]
    for data, *_ in glyphs:
        offsets.append(offsets[-1] + len(data))
    epoch = datetime(1904, 1, 1, tzinfo=timezone.utc)
    stamp = int((datetime(2026, 9, 9, tzinfo=timezone.utc) - epoch).total_seconds())
    os2 = pack("HhHHH", 0, ADVANCE, 400, 5, 0)
    os2 += pack("11h", 520, 560, 0, 112, 520, 560, 0, 384, 50, 300, 0)
    os2 += bytes([2, 0, 8, 9, 0, 0, 0, 0, 0, 0])
    os2 += pack("4I", 3, 0, 0, 0)  # Basic Latin and Latin-1 Supplement.
    os2 += b"CATF"
    os2 += pack("3H3h2H", 64, min(mapping), max(mapping), 750, -50, 0, 750, 50)
    tables = {
        "OS/2": os2,
        "cmap": make_cmap(mapping),
        "glyf": b"".join(g[0] for g in glyphs),
        "head": pack("IIIIHHqqhhhhHHhhh", 0x10000, 0x10000, 0, 0x5F0F3CF5,
                     3, EM, stamp, stamp, 50, 0, 550, 700, 0, 8, 2, 1, 0),
        "hhea": pack("IhhhH11hH", 0x10000, 750, -50, 0, ADVANCE,
                     0, 50, 550, 1, 0, 0, 0, 0, 0, 0, 0, len(glyphs)),
        "hmtx": b"".join(pack("Hh", ADVANCE, g[3]) for g in glyphs),
        "loca": pack("I" * len(offsets), *offsets),
        "maxp": pack("I14H", 0x10000, len(glyphs), max(g[1] for g in glyphs),
                     max(g[2] for g in glyphs), 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0),
        "name": make_name(),
        "post": pack("IihhIIIII", 0x30000, 0, -50, 50, 1, 0, 0, 0, 0),
    }
    count = len(tables)
    selector = count.bit_length() - 1
    search_range = 16 * (1 << selector)
    header = pack("I4H", 0x10000, count, search_range, selector, count * 16 - search_range)
    directory = bytearray()
    body = bytearray()
    head_offset = None
    for tag, data in sorted(tables.items()):
        offset = len(header) + count * 16 + len(body)
        directory += pack("4sIII", tag.encode("ascii"), checksum(data), offset, len(data))
        body += padded(data)
        if tag == "head":
            head_offset = offset
    font = bytearray(header + directory + body)
    adjustment = (0xB1B0AFBA - checksum(font)) & 0xFFFFFFFF
    struct.pack_into(">I", font, head_offset + 8, adjustment)
    assert checksum(font) == 0xB1B0AFBA
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(font)
    print(f"Built {OUTPUT.relative_to(ROOT)}: {len(font)} bytes, {len(glyphs)} glyphs, {len(mapping)} codepoints")


if __name__ == "__main__":
    build()
