# Cat Arcade

Original 5 × 7 pixel lettering drawn for Cat Fighter. No third-party font or
online font service is used. Copyright 2026 Cat Fighter contributors; distributed
with this project under the project's terms.

- File: `cat-arcade.ttf`; CSS family: `Cat Arcade`; style and weight: normal 400.
- Uppercase A–Z, digits, lowercase mapped to capitals, and common HUD punctuation.
  Includes `: . / - + × · ● ▶ ★`, spaces, brackets, and basic math punctuation.
- Equal advance width: 600 / 800 = 0.75 em. Visible capitals: 700 / 800 = 0.875 em.
  Ascender: 750; descender: −50; line gap: 0; units per em: 800.
- At a 16 px font size each drawing pixel is 2 px and capitals are 14 px tall.
  Multiples of 8 px give whole drawing pixels. Avoid synthetic bold or italics.
- Chinese and unsupported symbols should use the surrounding system fallback.
- Wait for `document.fonts.load('16px "Cat Arcade"')` before a one-time Canvas
  render; animation frames will naturally use the font after it finishes loading.

Rebuild reproducibly from the repository root with Python 3 (no packages needed):

```sh
python3 tools/build-arcade-font.py
```

The editable source drawings and minimal TrueType writer are in that script.
The file has a fixed version timestamp, so identical source produces identical
bytes. Font table layout follows the [OpenType specification](https://learn.microsoft.com/en-us/typography/opentype/spec/otff).
