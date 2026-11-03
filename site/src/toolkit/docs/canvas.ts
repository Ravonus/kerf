import type { DocGroup, ExampleRef } from '../types.ts'

const fill = (id: string, title: string, height: number, note?: string): ExampleRef => ({ id, title, stage: 'fill', height, note })

export const canvas: DocGroup = {
  file: 'canvas',
  title: 'Canvas and dithering',
  intro: "Drawings that use warp's colours, follow the theme and pause off screen, up to whole pages painted on one canvas.",
  docs: [
    {
      component: 'Canvas',
      hero: 'CanvasWave',
      summary: 'A canvas that handles sizing, sharp pixels, off-screen pausing and reduced motion for you.',
      use: {
        when: ['You need to draw something warp has no component for'],
        instead: [{ name: 'DitherField', why: 'a textured background is enough' }, { name: 'BarChart', why: 'it is data people need to read exactly' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          fill('CanvasBars', 'One drawing', 260, '`draw` gets a scaled context. Resolve a token through CSS before you paint with it. Returning true asks for another frame.'),
          fill('CanvasWave', 'Animated', 260, '`animate` runs every frame. Quiet and reduced motion get one still frame.'),
        ] },
        { kind: 'composition', title: 'Pointer', intro: '`pointer` fills `frame.pointer` with where it is, whether it is over the canvas and whether it is pressed, and repaints when it moves.', examples: [
          fill('CanvasPointer', 'Follows the pointer', 260, 'Move across the dots.'),
          fill('CanvasTrail', 'A fading trail', 260, 'Each move adds a point; `animate` fades the old ones out. Keep per-canvas state in the component, not the module.'),
          fill('CanvasRipples', 'Press to ripple', 260, '`pointer.down` turns true on a press over the canvas. Compare it with the last frame to catch the press itself.'),
          fill('CanvasNeedle', 'Eases, then stops', 260, 'No `animate`: the needle returns true while it is still moving, so frames stop as soon as it arrives.'),
        ] },
        { kind: 'composition', title: 'Data and text', intro: 'Text on a canvas takes the page\'s font through CSS, and a token\'s colour the same way.', examples: [
          fill('CanvasLive', 'A live line', 260, '`fps={30}` is plenty for a chart that scrolls, and costs half the frames.'),
        ] },
        { kind: 'composition', title: 'Theme and dial', examples: [
          fill('CanvasThemed', 'Colours kept until the theme changes', 260, 'Read colours once and keep them. `onTheme` runs before the repaint when the theme or dial changes, so drop them there.'),
          fill('CanvasOrbits', 'Reads the expression dial', 260, '`frame.tier` carries the dial\'s numbers where the canvas sits: more dots and faster at vivid, fewer at quiet.'),
        ] },
        { kind: 'composition', title: 'Pixels', examples: [
          fill('CanvasCells', 'Whole cells', 260, '`cell` draws in big square pixels. `fps` slows the clock.'),
          fill('CanvasLife', 'Game of Life', 260, 'In cell mode `width` and `height` count cells, so one cell is one `fillRect(x, y, 1, 1)`.'),
          fill('CanvasNight', 'An opaque picture', 260, '`context={{ alpha: false }}` for a drawing that covers every pixel: the page skips blending it.'),
        ] },
      ],
      a11yNotes: ['With `label` it is an image with that name. Without one it is decorative and hidden from screen readers.', 'Canvas has a size of zero until its container has one, so set a height.'],
      propDocs: { draw: 'Paints one frame. Read colours from warp\'s tokens so the theme applies.', onTheme: 'Called when the theme changes. Refresh any colours you keep here.' },
      related: ['CanvasStage', 'DitherField', 'Dither'],
    },
    {
      component: 'CanvasStage',
      hero: 'StageLanding',
      summary: 'Paints the page laid out inside it on one canvas, in any look: cards, buttons, fields, modals, type and scroll.',
      use: {
        when: ['A page or section should be drawn on canvas but still behave like HTML', 'Controls in a look CSS can\'t draw: pencil, glow, pixels, dithering'],
        instead: [{ name: 'Canvas', why: 'it is a drawing, not a page' }, { name: 'DitherStage', why: 'you want the dithered look, ready made' }],
      },
      sections: [
        { kind: 'variants', title: 'Looks', intro: 'The same markup under three sets of painters. A look is only painters, a background and an overlay.', examples: [
          fill('CanvasStageFlat', 'Flat', 420, 'Clean vector: rounded shapes, soft shadows, a gradient on the type and dots that scroll with the page.'),
          fill('CanvasStageSketch', 'Sketch', 420, 'Pencil on ruled paper: wobbly outlines seeded per element so they hold still, and hatched fills.'),
          fill('CanvasStageNeon', 'Neon', 420, 'Glowing strokes over a floor grid that rolls with time and scroll. `animate` keeps the background moving.'),
        ] },
        { kind: 'composition', title: 'A whole page', intro: 'A landing page where everything you see is painted, in four looks over the same HTML. Scroll it, press things, tab through it, open the modal, and narrow the frame to watch it stack.', examples: [
          fill('StageLanding', 'Landing page', 790, 'The page, its sticky header and its modal are three stages. Dither is `DitherStage`; the other looks are `CanvasStage` with painters from this file.'),
        ] },
        { kind: 'composition', title: 'From scratch', examples: [
          fill('CanvasStagePlain', 'Two painters', 260, 'A painter gets the piece (its box, corner radius, hover, press, focus, checked, value) and the scene, whose `ctx` is a plain 2D context in CSS pixels.'),
        ] },
        { kind: 'prose', title: 'How a stage works', md: 'The DOM lays the page out and keeps everything it is good at: wrapping, grids that stack on a phone, focus, typing, selection, forms and the accessibility tree. Each element marked `data-skin` gives up its paint, and the stage hands it to the painter of that name every frame something moves, under the element\'s own text.\n\nThe skins the looks here share are `button` (`data-look="outline"`), `card` (a link or button card can be chosen with `aria-pressed`), `panel` and `bar` for windows, `field`, `menu` and `option` for a StageSelect\'s list, `check` (checkboxes and radios), `switch`, `range`, `meter`, `chip`, `rule`, `type`, `art` and `clear`. Any other name works too: give it a painter.\n\nThe scene carries what a look needs beyond the pieces: `scroll` to move a background with the page, `presses` to answer a click where it landed, `rail` for a drawn scrollbar you can drag, `shown` for an entrance such as a modal\'s veil, `color()` to read warp\'s tokens, and `words()` to paint an element\'s text where the DOM set it. `layout="scroll"` makes the stage a scroller and paints its view; `layout="page"` paints the viewport, for a whole site. A stage inside another, such as a sticky header\'s or a dialog\'s, paints over it.' },
        { kind: 'prose', title: 'Styling', md: 'Skins need no styles of their own. The stage\'s CSS gives each one its padding, corners and size at zero specificity, from properties you can set on any element above it, so a page starts styled and any class of yours wins.\n\n- Colours: `--stage-ink`, `--stage-paper`, `--stage-accent`, `--stage-soft`, and `--stage-on-fill` for text on a filled button or chip. Unset, they follow warp\'s tokens, so light and dark come free.\n- Corners: `--stage-radius` for controls, `--stage-radius-surface` for cards, panels and art.\n- Padding: `--stage-pad-button`, `--stage-pad-field`, `--stage-pad-menu`, `--stage-pad-option`, `--stage-pad-chip`, `--stage-pad-card`, `--stage-pad-bar`, `--stage-pad-clear`, and `--stage-gap`, `--stage-gap-card` inside them.\n- Sizes: `--stage-check-size`, `--stage-switch-inline`, `--stage-switch-block`, `--stage-range-block`, `--stage-meter-block`, `--stage-rule-block`, `--stage-art-ratio`.\n- Type: `--stage-type-font`, `--stage-type-weight` and `--stage-type-spacing`, which each stage resolves to `--stage-type-face`, `-heft` and `-track` for a heading under your own `h1` rule to name. The dither look defaults to a sans, which holds up a cell at a time. `--stage-label-size` for `data-part="label"`, the label over a field. `data-part="option"` sets a check or switch beside its words.\n\nA look reads the colour properties too, so one set of values restyles every look on the page. A panel in a veiled stage rises in as its dialog opens, and the paint follows it.' },
      ],
      a11yNotes: [
        'Every control is real HTML, so keyboard, screen readers, autofill and form validation work as they do anywhere. Draw focus in your painters: `piece.focus` follows `:focus-visible`.',
        'Before the stage paints, and under forced colours, skins keep plain borders and the canvas is hidden.',
        '`type` keeps its words in the page, selectable and read aloud, while the look paints them.',
        'Set `--stage-on-fill` to the text colour for filled buttons and chips in your look, and check its contrast.',
      ],
      propDocs: {
        layout: '`box` paints its own block, `scroll` is a scroller and paints its view, `page` paints the viewport.',
        painters: 'Painters by skin name. Each gets the piece and the scene.',
        background: 'Paints under the pieces, on a cleared canvas.',
        overlay: 'Paints over the pieces: presses, the rail, anything on top.',
        paint: 'Replaces the whole frame, for a look that paints its own way, as the dither look does.',
        animate: 'Paint every frame while motion is on, for a moving background. Pieces animate without it.',
        rail: 'Scroll when the rail is dragged. The look paints it from `scene.rail`.',
        veil: 'A modal\'s stage: its dialog spans the viewport, and the stage centres its panel.',
      },
      related: ['DitherStage', 'StageSelect', 'Canvas'],
    },
    {
      component: 'StageSelect',
      hero: 'StageSelectDither',
      summary: 'A select a stage draws, list and all, in whatever look the stage around it has.',
      use: {
        when: ['A select on a CanvasStage or DitherStage, where the native list would break the look'],
        instead: [{ name: 'Select', why: 'the page isn\'t on a stage' }],
      },
      sections: [
        { kind: 'variants', title: 'Looks', intro: 'The same markup on three stages. The list floats in the top layer as a stage of its own and paints with the look it opened from, so nothing clips it and nothing under it shows through.', examples: [
          fill('StageSelectFlat', 'Flat', 300, 'Painted by the `menu` and `option` painters in this file\'s flat look.'),
          fill('StageSelectSketch', 'Sketch', 300, 'Its paper is solid, so the page under it stays hidden.'),
        ] },
        { kind: 'prose', title: 'Styling', md: 'The trigger is a `field` skin and gets a chevron that turns over while the list is open. The list is a `menu` skin and its rows are `option` skins: `piece.hover` is the row under the pointer or the keys, and `piece.on` the chosen one. Size them with `--stage-pad-menu`, `--stage-pad-option` and `--stage-menu-block`, the list\'s greatest height.' },
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
    {
      component: 'DitherStage',
      hero: 'StageSkins',
      summary: 'A CanvasStage in the dithered look: every skin drawn in whole cells of the theme\'s inks.',
      use: {
        when: ['A page or section in the dithered look, ready made'],
        instead: [{ name: 'CanvasStage', why: 'you want another look, or your own' }, { name: 'DitherField', why: 'only the background should move' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          fill('StageSkins', 'The skins', 420, 'Hover, press, focus, checked and disabled come from the element itself. Pieces dissolve in the first time they scroll into view.'),
        ] },
        { kind: 'composition', title: 'Hybrid and your own', intro: 'Anything without a skin paints itself over the stage, so warp components and canvas pieces share a page.', examples: [
          fill('StageHybrid', 'Warp components on a stage', 420, 'The card on the left is warp\'s; the one on the right is drawn in cells, with dithered type and a live `art` field.'),
          fill('StageOwnSkin', 'A skin of your own', 260, '`painters` maps a skin to a function that draws its piece with the brush, in tones that the stage dithers. This battery reads a `<meter>`.'),
          fill('StageModal', 'A modal', 200, 'A native `<dialog>` with its own stage: `veil` dithers over the page, and the panel rises in each time it opens.'),
        ] },
      ],
      a11yNotes: [
        'Everything CanvasStage promises holds: real controls, plain borders before it paints and under forced colours.',
        'Reduced motion holds the field still and drops the dissolves and rings; every state still shows.',
      ],
      propDocs: {
        layout: '`box` paints its own block, `scroll` is a scroller and paints its view, `page` paints the viewport.',
        ground: 'How strong the field under the pieces is, 0 to 1. 0 leaves only the pieces.',
        drift: 'How far the field travels for each pixel scrolled: parallax.',
        rail: 'A dithered scroll rail on the right, in place of the native bar. Drag it to scroll.',
        veil: 'A dithered scrim over everything under the pieces, this dense: for a modal.',
        painters: 'Your own skins, drawn with the brush in tones 0 to 1 that the stage turns into inks.',
        ripple: 'The inks a press rings out in, or `false` for none.',
        ramp: 'The field\'s inks, and the ramp of pieces that name none.',
        cell: 'CSS pixels per cell. Default 3.',
      },
      related: ['CanvasStage', 'DitherField'],
    },
    {
      component: 'DitherField',
      hero: 'DitherFieldHero',
      summary: 'A moving dithered texture for backgrounds, in the theme\'s colours.',
      use: {
        when: ['A hero or section that needs a living background'],
        instead: [{ name: 'Dither', why: 'a still picture is enough' }, { name: 'DitherGlyph', why: 'a word or logo should carry the texture' }],
      },
      playground: {
        example: 'DitherFieldPlay',
        code: '<DitherField{props} />',
        knobs: [
          { prop: 'kind', control: 'select', options: ['weave', 'flow', 'rings', 'aurora', 'drift'], initial: 'weave', default: 'weave' },
          { prop: 'ramp', control: 'select', options: ['accent', 'neutral', 'positive', 'caution', 'critical', 'info', 'highlight'], initial: 'accent', default: 'accent' },
          { prop: 'pattern', control: 'select', options: ['bayer2', 'bayer4', 'bayer8', 'blue', 'halftone'], initial: 'bayer4', default: 'bayer4' },
          { prop: 'cell', control: 'slider', min: 2, max: 10, step: 1, initial: 4, default: 4 },
          { prop: 'pointer', control: 'select', options: ['ripple', 'pull', 'shockwave'], initial: 'ripple', default: '' },
          { prop: 'speed', control: 'slider', min: 0, max: 3, step: 0.5, initial: 1, default: 1 },
        ],
        stage: 'fill',
        height: 420,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          fill('DitherFieldKinds', 'Kinds', 420, 'Five named fields, and the last is your own function of x, y and time.'),
          fill('DitherFieldRamps', 'Colours', 420, '`ramp` takes a tone or your own list of colours, faintest first.'),
          fill('DitherFieldPointer', 'Pointer', 320, '`pointer` disturbs the field and `spark` colours the disturbance.'),
        ] },
        { kind: 'states', title: 'States', examples: [fill('DitherFieldStill', 'Held still', 320, '`speed={0}` holds one frame, and `seed` chooses which.')] },
        { kind: 'composition', title: 'In context', examples: [fill('DitherFieldHero', 'Hero', 340, 'Children sit on top. `fade` clears a side for type.')] },
      ],
      a11yNotes: ['It moves at the vivid and balanced dials, and holds still at quiet and under reduced motion.', 'It is decorative unless you give it a `label`.'],
      propDocs: { ramp: 'The inks: a tone such as `accent`, or your own list of colours.', pattern: 'The ordered-dither tile: `bayer2`, `bayer4`, `bayer8`, `blue` noise or `halftone`.', pointer: 'How the field answers the pointer: `ripple`, `pull` or `shockwave`, or several.', fps: 'Caps the frame rate while it moves.', kind: 'The named field, or your own function of `(x, y, t)`.', spark: 'The colours a disturbed cell takes.', fade: 'Dissolves toward `left`, `right`, `top`, `bottom`, or `edges`.', cell: 'CSS pixels per dither cell.', fill: 'Fills the nearest positioned parent, for a section background.', ratio: 'CSS aspect ratio. Defaults to 16 / 9.' },
      related: ['Dither', 'DitherGlyph', 'Canvas'],
    },
    {
      component: 'Dither',
      summary: 'A still image or gradient, redrawn in dots of the theme\'s colours.',
      use: { when: ['A picture should match the theme', 'A quiet textured band'], instead: [{ name: 'DitherField', why: 'it should move' }] },
      playground: {
        example: 'DitherPlay',
        code: '<Dither{props} />',
        knobs: [
          { prop: 'algorithm', control: 'select', options: ['bayer2', 'bayer4', 'bayer8', 'blue', 'halftone', 'floyd', 'atkinson'], initial: 'bayer8', default: 'bayer8' },
          { prop: 'ramp', control: 'select', options: ['accent', 'neutral', 'positive', 'caution', 'critical', 'info', 'highlight'], initial: 'accent', default: 'accent' },
          { prop: 'cell', control: 'slider', min: 2, max: 10, step: 1, initial: 4, default: 4 },
          { prop: 'invert', control: 'switch', initial: false, default: false },
        ],
        stage: 'fill',
        height: 420,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          fill('DitherImage', 'An image', 420, 'The real image stays underneath, so `alt` still works and a failed load still shows it.'),
          fill('DitherGradient', 'A gradient', 320, 'With no `src`, it dithers a soft gradient.'),
          fill('DitherRadial', 'A radial gradient', 320, '`from` and `to` run from 0 to 1.'),
          fill('DitherAlgorithms', 'Algorithms', 460, 'Patterns stay steady and suit gradients. `floyd` and `atkinson` hold more detail in images.'),
        ] },
        { kind: 'composition', title: 'In context', examples: [fill('DitherBanner', 'A status banner', 280, 'Use `gradient` and `ramp` to shade a banner, and `ratio` to set its shape.')] },
      ],
      a11yNotes: ['An image keeps its `alt`. A gradient is decorative unless you give it a `label`.'],
      propDocs: { gradient: 'With no `src`: `{ angle, radial, from, to }`.', algorithm: '`atkinson` by default for images, `bayer8` for gradients.', invert: 'Swaps light and dark.', contrast: 'Tone contrast, around 1.' },
      related: ['DitherField', 'DitherGlyph'],
    },
    {
      component: 'DitherGlyph',
      summary: 'A word or logo woven out of a moving dithered field.',
      use: { when: ['A big brand moment: a wordmark or a logo'], instead: [{ name: 'Heading', why: 'it is ordinary text' }] },
      playground: {
        example: 'DitherGlyphPlay',
        code: '<DitherGlyph{props} />',
        knobs: [
          { prop: 'text', control: 'text', initial: 'weft', default: '' },
          { prop: 'kind', control: 'select', options: ['weave', 'flow', 'rings', 'aurora', 'drift'], initial: 'flow', default: 'flow' },
          { prop: 'ramp', control: 'select', options: ['accent', 'neutral', 'positive', 'info', 'highlight'], initial: 'accent', default: 'accent' },
          { prop: 'cell', control: 'slider', min: 2, max: 8, step: 1, initial: 4, default: 4 },
        ],
        stage: 'fill',
        height: 340,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          fill('DitherGlyphWord', 'A word', 260, 'The word stays in the page as real text, for readers and search.'),
          fill('DitherGlyphLogo', 'A logo', 340, 'Pass an SVG `path` and its `box`.'),
          fill('DitherGlyphDrawn', 'Your own drawing', 340, '`draw` paints the shape in cells.'),
          { ...fill('DitherGlyphReveal', 'Reveal', 260, '`reveal` draws the shape on over that many seconds.'), replay: true },
        ] },
      ],
      a11yNotes: ['A `text` glyph is real text. Give a `path` or `draw` glyph a `label`.'],
      propDocs: { ramp: 'The inks: a tone such as `accent`, or your own list of colours.', pattern: 'The ordered-dither tile: `bayer2`, `bayer4`, `bayer8`, `blue` noise or `halftone`.', pointer: 'How the field answers the pointer: `ripple`, `pull` or `shockwave`, or several.', fps: 'Caps the frame rate while it moves.', path: 'An SVG path, for a logo.', box: 'The size of the box the path was drawn in.', stroke: 'Line width, for a path made of lines.', fit: 'The share of the box the shape fills, 0 to 1.', draw: 'Paints the shape on a canvas, in cells.', font: 'The font for `text`.', weight: 'The font weight for `text`.' },
      related: ['DitherField', 'Dither'],
    },
  ],
}
