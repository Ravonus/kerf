# warp 10 — Icons

The rules every drawing in `@weft/icons` is held to. Every icon is original: nothing is copied, traced or adapted from
another set, and nothing here carries another set's licence. Source art is `packages/icons/art/`.

## 1. Three tiers, one dial

The tiers are the expression stops (00 §3). Same names, same meaning, same box.

| | quiet | balanced | vivid |
|---|---|---|---|
| Drawing | outline | outline | pixel art, drawn by hand on 16×16 |
| Corner radius | 2.4 (soft, follows radius 8) | 1 (tight, follows radius 5) | one stepped pixel |
| Notch gap | 2.1 | 3 | 1 cell |
| Weft stroke | 1.5 | 2 | ink, with shade behind it |
| Caps, joins | round | round | square by nature |

## 2. Grid

- The box is warp's 24 grid. It is 16 pixels at × 1.5, so one stroke is 1.5 and draws as exactly 1px at 16 (00 §6).
- **Outline coordinates are pixel centres.** Art is written in pixel units `u`, placed at `1.5u + 0.75`, so a straight
  stroke fills one pixel row at warp's default 16px instead of smearing across two.
- Live area is columns and rows 1 to 13, centred on 7. Round forms may reach 0 and 14 for optical balance. Rows 14 and 15
  are empty unless a form needs them.

## 3. Outline strokes

- Weight 1.5 everywhere, set by `--warp-icon-stroke`; the weft stroke by `--warp-icon-weft`.
- Outline only. Fill marks state, never decoration.
- Diagonals are 45° wherever the form allows.
- Dots are round caps on a zero-length stroke, so they follow the stroke weight.
- Corners on containers follow the tier's radius. Marks (check, chevrons, arrowheads) keep sharp vertices, softened only
  by the round join.

## 4. The two signatures

1. **The notch.** warp's floated label sits in a gap in the field's top border. Every closed outer container in the set
   (box, ring, document, device) leaves that same gap in its top edge, near the left corner; on a ring, at about 10
   o'clock. Containers under 6 cells across keep their line, since the gap would read as damage.
2. **The weft.** warp threads run one way and the weft crosses them in accent. Every icon that has a container and a
   meaning separates them: the container is warp, and the one stroke that says what the icon means (the check inside the
   shield, the hands of the clock) is the weft. It carries the emphasis weight (1.5 / 2, like the emphasis line), and
   the app can colour it through `stroke` on `[data-w]`. A single-stroke mark is all weft.

## 5. Pixel tier

Looks to Keel's art: native grid, integer positions, hard-edged cells, no anti-aliased colour, stepped silhouettes,
light from the top left.

- 16×16, one-cell lines, `shape-rendering="crispEdges"`, merged rect paths, `currentColor`.
- Two tones only: ink `#` and shade `+` (ink at 40%). Shade sits inside the form, bottom and right, where Keel's ramps
  put their dark tone. No gradients, no filters.
- **An icon must read with the shade removed.** Shade adds volume and never carries meaning, so forced colours and
  thin rendering lose nothing that matters.
- Corners step: the corner cell of a frame is left empty.
- No filled blob where a line will do. The silhouette should be recognisable at 16px, at 1×.
- The notch is one empty cell in the top edge, third from the left. The weft is the solid ink mark in the middle.
- Each one is drawn cell by cell. Pixel icons are never derived from the outline tier.

## 6. Optical sizes

| Size | Outline | Pixel |
|---|---|---|
| 16 | designed size, 1px strokes on pixel rows | native, 1 cell = 1px |
| 20 | scales | 1 cell = 1.25px, uneven cells on a 1× screen |
| 24 | scales | 1 cell = 1.5px, uneven on 1×, even on 2× |
| 32, 48 | scales | exact, 2× and 3× |

## 7. Accessibility

Decorative by default (`aria-hidden`, `focusable="false"`). `label` makes it `role="img"` with that name. Colour is always
`currentColor`, so forced colours and both themes work with no extra rule. An icon never carries meaning alone (05 §5).

## 8. Shipping

- `import { IconCheck } from '@weft/icons'` is one export; an unused one costs nothing.
- `iconSet({ check: IconCheck })` gives a `<Icon name>` over those icons. `@weft/icons/all` is that over all of them.
- `icons({ tier: 'vivid' })` in `weft.config.ts` compiles one tier in, with no switch at all. With no tier, each icon
  carries its tiers and `tiers.css` shows the right one from the nearest `data-expression`: CSS only, no script,
  no flash and no change of box.
