import type { Doc } from '../types.ts'
import { fill } from './canvas-fill.ts'

export const surfaceDocs: Doc[] = [
  {
    component: 'Canvas',
    hero: 'CanvasWave',
    summary:
      'A canvas that handles sizing, sharp pixels, off-screen pausing and reduced motion for you.',
    use: {
      when: ['You need to draw something Warp has no component for'],
      instead: [
        { name: 'DitherField', why: 'a textured background is enough' },
        { name: 'BarChart', why: 'it is data people need to read exactly' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          fill(
            'CanvasBars',
            'One drawing',
            260,
            '`draw` gets a scaled context. Resolve a token through CSS before you paint with it. Returning true asks for another frame.',
          ),
          fill(
            'CanvasWave',
            'Animated',
            260,
            '`animate` runs every frame. Quiet and reduced motion get one still frame.',
          ),
        ],
      },
      {
        kind: 'composition',
        title: 'Pointer',
        intro:
          '`pointer` fills `frame.pointer` with where it is, whether it is over the canvas and whether it is pressed, and repaints when it moves.',
        examples: [
          fill('CanvasPointer', 'Follows the pointer', 260, 'Move across the dots.'),
          fill(
            'CanvasTrail',
            'A fading trail',
            260,
            'Each move adds a point; `animate` fades the old ones out. Keep per-canvas state in the component, not the module.',
          ),
          fill(
            'CanvasRipples',
            'Press to ripple',
            260,
            '`pointer.down` turns true on a press over the canvas. Compare it with the last frame to catch the press itself.',
          ),
          fill(
            'CanvasNeedle',
            'Eases, then stops',
            260,
            'No `animate`: the needle returns true while it is still moving, so frames stop as soon as it arrives.',
          ),
        ],
      },
      {
        kind: 'composition',
        title: 'Data and text',
        intro:
          "Text on a canvas takes the page's font through CSS, and a token's colour the same way.",
        examples: [
          fill(
            'CanvasLive',
            'A live line',
            260,
            '`fps={30}` is plenty for a chart that scrolls, and costs half the frames.',
          ),
        ],
      },
      {
        kind: 'composition',
        title: 'Theme and dial',
        examples: [
          fill(
            'CanvasThemed',
            'Colours kept until the theme changes',
            260,
            'Read colours once and keep them. `onTheme` runs before the repaint when the theme or dial changes, so drop them there.',
          ),
          fill(
            'CanvasOrbits',
            'Reads the expression dial',
            260,
            "`frame.tier` carries the dial's numbers where the canvas sits: more dots and faster at vivid, fewer at quiet.",
          ),
        ],
      },
      {
        kind: 'composition',
        title: 'Pixels',
        examples: [
          fill(
            'CanvasCells',
            'Whole cells',
            260,
            '`cell` draws in big square pixels. `fps` slows the clock.',
          ),
          fill(
            'CanvasLife',
            'Game of Life',
            260,
            'In cell mode `width` and `height` count cells, so one cell is one `fillRect(x, y, 1, 1)`.',
          ),
          fill(
            'CanvasNight',
            'An opaque picture',
            260,
            '`context={{ alpha: false }}` for a drawing that covers every pixel: the page skips blending it.',
          ),
        ],
      },
    ],
    a11yNotes: [
      'With `label` it is an image with that name. Without one it is decorative and hidden from screen readers.',
      'Canvas has a size of zero until its container has one, so set a height.',
    ],
    propDocs: {
      draw: "Paints one frame. Read colours from Warp's tokens so the theme applies.",
      onTheme: 'Called when the theme changes. Refresh any colours you keep here.',
    },
    related: ['CanvasStage', 'DitherField', 'Dither'],
  },
  {
    component: 'CanvasStage',
    hero: 'StageLanding',
    summary:
      'Paints the page laid out inside it on one canvas, in any look: cards, buttons, fields, modals, type and scroll.',
    use: {
      when: [
        'A page or section should be drawn on canvas but still behave like HTML',
        "Controls in a look CSS can't draw: pencil, glow, pixels, dithering",
      ],
      instead: [
        { name: 'Canvas', why: 'it is a drawing, not a page' },
        { name: 'DitherStage', why: 'you want the dithered look, ready made' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Looks',
        intro:
          'The same markup under three sets of painters. A look is only painters, a background and an overlay.',
        examples: [
          fill(
            'CanvasStageFlat',
            'Flat',
            420,
            'Clean vector: rounded shapes, soft shadows, a gradient on the type and dots that scroll with the page.',
          ),
          fill(
            'CanvasStageSketch',
            'Sketch',
            420,
            'Pencil on ruled paper: wobbly outlines seeded per element so they hold still, and hatched fills.',
          ),
          fill(
            'CanvasStageNeon',
            'Neon',
            420,
            'Glowing strokes over a floor grid that rolls with time and scroll. `animate` keeps the background moving.',
          ),
        ],
      },
      {
        kind: 'composition',
        title: 'A whole page',
        intro:
          'A landing page where everything you see is painted, in four looks over the same HTML. Scroll it, press things, tab through it, open the modal, and narrow the frame to watch it stack.',
        examples: [
          fill(
            'StageLanding',
            'Landing page',
            790,
            'The page, its sticky header and its modal are three stages. Dither is `DitherStage`; the other looks are `CanvasStage` with painters from this file.',
          ),
        ],
      },
      {
        kind: 'composition',
        title: 'From scratch',
        examples: [
          fill(
            'CanvasStagePlain',
            'Two painters',
            260,
            'A painter gets the piece (its box, corner radius, hover, press, focus, checked, value) and the scene, whose `ctx` is a plain 2D context in CSS pixels.',
          ),
        ],
      },
      {
        kind: 'prose',
        title: 'How a stage works',
        md: "The DOM lays the page out and keeps everything it is good at: wrapping, grids that stack on a phone, focus, typing, selection, forms and the accessibility tree. Each element marked `data-skin` gives up its paint, and the stage hands it to the painter of that name every frame something moves, under the element's own text.\n\nThe skins the looks here share are `button` (`data-look=\"outline\"`), `card` (a link or button card can be chosen with `aria-pressed`), `panel` and `bar` for windows, `field`, `menu` and `option` for a StageSelect's list, `check` (checkboxes and radios), `switch`, `range`, `meter`, `chip`, `rule`, `type`, `art` and `clear`. Any other name works too: give it a painter.\n\nThe scene carries what a look needs beyond the pieces: `scroll` to move a background with the page, `presses` to answer a click where it landed, `rail` for a drawn scrollbar you can drag, `shown` for an entrance such as a modal's veil, `color()` to read warp's tokens, and `words()` to paint an element's text where the DOM set it. `layout=\"scroll\"` makes the stage a scroller and paints its view; `layout=\"page\"` paints the viewport, for a whole site. A stage inside another, such as a sticky header's or a dialog's, paints over it.",
      },
      {
        kind: 'prose',
        title: 'Styling',
        md: 'Skins need no styles of their own. The stage\'s CSS gives each one its padding, corners and size at zero specificity, from properties you can set on any element above it, so a page starts styled and any class of yours wins.\n\n- Colours: `--stage-ink`, `--stage-paper`, `--stage-accent`, `--stage-soft`, and `--stage-on-fill` for text on a filled button or chip. Unset, they follow warp\'s tokens, so light and dark come free.\n- Corners: `--stage-radius` for controls, `--stage-radius-surface` for cards, panels and art.\n- Padding: `--stage-pad-button`, `--stage-pad-field`, `--stage-pad-menu`, `--stage-pad-option`, `--stage-pad-chip`, `--stage-pad-card`, `--stage-pad-bar`, `--stage-pad-clear`, and `--stage-gap`, `--stage-gap-card` inside them.\n- Sizes: `--stage-check-size`, `--stage-switch-inline`, `--stage-switch-block`, `--stage-range-block`, `--stage-meter-block`, `--stage-rule-block`, `--stage-art-ratio`.\n- Type: `--stage-type-font`, `--stage-type-weight` and `--stage-type-spacing`, which each stage resolves to `--stage-type-face`, `-heft` and `-track` for a heading under your own `h1` rule to name. The dither look defaults to a sans, which holds up a cell at a time. `--stage-label-size` for `data-part="label"`, the label over a field. `data-part="option"` sets a check or switch beside its words.\n\nA look reads the colour properties too, so one set of values restyles every look on the page. A panel in a veiled stage rises in as its dialog opens, and the paint follows it.',
      },
    ],
    a11yNotes: [
      'Every control is real HTML, so keyboard, screen readers, autofill and form validation work as they do anywhere. Draw focus in your painters: `piece.focus` follows `:focus-visible`.',
      'Before the stage paints, and under forced colours, skins keep plain borders and the canvas is hidden.',
      '`type` keeps its words in the page, selectable and read aloud, while the look paints them.',
      'Set `--stage-on-fill` to the text colour for filled buttons and chips in your look, and check its contrast.',
    ],
    propDocs: {
      layout:
        '`box` paints its own block, `scroll` is a scroller and paints its view, `page` paints the viewport.',
      painters: 'Painters by skin name. Each gets the piece and the scene.',
      background: 'Paints under the pieces, on a cleared canvas.',
      overlay: 'Paints over the pieces: presses, the rail, anything on top.',
      paint:
        'Replaces the whole frame, for a look that paints its own way, as the dither look does.',
      animate:
        'Paint every frame while motion is on, for a moving background. Pieces animate without it.',
      rail: 'Scroll when the rail is dragged. The look paints it from `scene.rail`.',
      veil: "A modal's stage: its dialog spans the viewport, and the stage centres its panel.",
    },
    related: ['DitherStage', 'StageSelect', 'Canvas'],
  },
  {
    component: 'StageSelect',
    hero: 'StageSelectDither',
    summary: 'A select a stage draws, list and all, in whatever look the stage around it has.',
    use: {
      when: [
        'A select on a CanvasStage or DitherStage, where the native list would break the look',
      ],
      instead: [{ name: 'Select', why: "the page isn't on a stage" }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Looks',
        intro:
          'The same markup on three stages. The list floats in the top layer as a stage of its own and paints with the look it opened from, so nothing clips it and nothing under it shows through.',
        examples: [
          fill(
            'StageSelectFlat',
            'Flat',
            300,
            "Painted by the `menu` and `option` painters in this file's flat look.",
          ),
          fill(
            'StageSelectSketch',
            'Sketch',
            300,
            'Its paper is solid, so the page under it stays hidden.',
          ),
        ],
      },
      {
        kind: 'prose',
        title: 'Styling',
        md: "The trigger is a `field` skin and gets a chevron that turns over while the list is open. The list is a `menu` skin and its rows are `option` skins: `piece.hover` is the row under the pointer or the keys, and `piece.on` the chosen one. Size them with `--stage-pad-menu`, `--stage-pad-option` and `--stage-menu-block`, the list's greatest height.",
      },
    ],
    a11yNotes: [
      'An APG select-only combobox: focus stays on the trigger, `aria-activedescendant` names the active row, and arrows, Home, End, Page keys and typeahead move through it. Enter, Space or Tab picks; Escape closes.',
      'Wrap it in a `<label>` to name it. `name` puts the value in a form through a hidden input.',
    ],
    propDocs: {
      options: 'Strings, or `{ value, label, disabled }`.',
      value: 'The value it starts on. The first option when left out.',
      name: 'Puts the value in a form, through a hidden input.',
      onChange: 'Hears each value picked.',
    },
    related: ['CanvasStage', 'DitherStage', 'Select'],
  },
]
