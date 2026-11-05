import type { Doc } from '../types.ts'
import { fill } from './canvas-fill.ts'

export const ditherDocs: Doc[] = [
  {
    component: 'DitherStage',
    hero: 'StageSkins',
    summary:
      "A CanvasStage in the dithered look: every skin drawn in whole cells of the theme's inks.",
    use: {
      when: ['A page or section in the dithered look, ready made'],
      instead: [
        { name: 'CanvasStage', why: 'you want another look, or your own' },
        { name: 'DitherField', why: 'only the background should move' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          fill(
            'StageSkins',
            'The skins',
            420,
            'Hover, press, focus, checked and disabled come from the element itself. Pieces dissolve in the first time they scroll into view.',
          ),
        ],
      },
      {
        kind: 'composition',
        title: 'Hybrid and your own',
        intro:
          'Anything without a skin paints itself over the stage, so warp components and canvas pieces share a page.',
        examples: [
          fill(
            'StageHybrid',
            'Warp components on a stage',
            420,
            "The card on the left is warp's; the one on the right is drawn in cells, with dithered type and a live `art` field.",
          ),
          fill(
            'StageOwnSkin',
            'A skin of your own',
            260,
            '`painters` maps a skin to a function that draws its piece with the brush, in tones that the stage dithers. This battery reads a `<meter>`.',
          ),
          fill(
            'StageModal',
            'A modal',
            200,
            'A native `<dialog>` with its own stage: `veil` dithers over the page, and the panel rises in each time it opens.',
          ),
        ],
      },
    ],
    a11yNotes: [
      'Everything CanvasStage promises holds: real controls, plain borders before it paints and under forced colours.',
      'Reduced motion holds the field still and drops the dissolves and rings; every state still shows.',
    ],
    propDocs: {
      layout:
        '`box` paints its own block, `scroll` is a scroller and paints its view, `page` paints the viewport.',
      ground: 'How strong the field under the pieces is, 0 to 1. 0 leaves only the pieces.',
      drift: 'How far the field travels for each pixel scrolled: parallax.',
      rail: 'A dithered scroll rail on the right, in place of the native bar. Drag it to scroll.',
      veil: 'A dithered scrim over everything under the pieces, this dense: for a modal.',
      painters:
        'Your own skins, drawn with the brush in tones 0 to 1 that the stage turns into inks.',
      ripple: 'The inks a press rings out in, or `false` for none.',
      ramp: "The field's inks, and the ramp of pieces that name none.",
      cell: 'CSS pixels per cell. Default 3.',
    },
    related: ['CanvasStage', 'DitherField'],
  },
  {
    component: 'DitherField',
    hero: 'DitherFieldHero',
    summary: "A moving dithered texture for backgrounds, in the theme's colours.",
    use: {
      when: ['A hero or section that needs a living background'],
      instead: [
        { name: 'Dither', why: 'a still picture is enough' },
        { name: 'DitherGlyph', why: 'a word or logo should carry the texture' },
      ],
    },
    playground: {
      example: 'DitherFieldPlay',
      code: '<DitherField{props} />',
      knobs: [
        {
          prop: 'kind',
          control: 'select',
          options: ['weave', 'flow', 'rings', 'aurora', 'drift'],
          initial: 'weave',
          default: 'weave',
        },
        {
          prop: 'ramp',
          control: 'select',
          options: ['accent', 'neutral', 'positive', 'caution', 'critical', 'info', 'highlight'],
          initial: 'accent',
          default: 'accent',
        },
        {
          prop: 'pattern',
          control: 'select',
          options: ['bayer2', 'bayer4', 'bayer8', 'blue', 'halftone'],
          initial: 'bayer4',
          default: 'bayer4',
        },
        { prop: 'cell', control: 'slider', min: 2, max: 10, step: 1, initial: 4, default: 4 },
        {
          prop: 'pointer',
          control: 'select',
          options: ['ripple', 'pull', 'shockwave'],
          initial: 'ripple',
          default: '',
        },
        { prop: 'speed', control: 'slider', min: 0, max: 3, step: 0.5, initial: 1, default: 1 },
      ],
      stage: 'fill',
      height: 420,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          fill(
            'DitherFieldKinds',
            'Kinds',
            420,
            'Five named fields, and the last is your own function of x, y and time.',
          ),
          fill(
            'DitherFieldRamps',
            'Colours',
            420,
            '`ramp` takes a tone or your own list of colours, faintest first.',
          ),
          fill(
            'DitherFieldPointer',
            'Pointer',
            320,
            '`pointer` disturbs the field and `spark` colours the disturbance.',
          ),
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          fill(
            'DitherFieldStill',
            'Held still',
            320,
            '`speed={0}` holds one frame, and `seed` chooses which.',
          ),
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          fill(
            'DitherFieldHero',
            'Hero',
            340,
            'Children sit on top. `fade` clears a side for type.',
          ),
        ],
      },
    ],
    a11yNotes: [
      'It moves at the vivid and balanced dials, and holds still at quiet and under reduced motion.',
      'It is decorative unless you give it a `label`.',
    ],
    propDocs: {
      ramp: 'The inks: a tone such as `accent`, or your own list of colours.',
      pattern: 'The ordered-dither tile: `bayer2`, `bayer4`, `bayer8`, `blue` noise or `halftone`.',
      pointer: 'How the field answers the pointer: `ripple`, `pull` or `shockwave`, or several.',
      fps: 'Caps the frame rate while it moves.',
      kind: 'The named field, or your own function of `(x, y, t)`.',
      spark: 'The colours a disturbed cell takes.',
      fade: 'Dissolves toward `left`, `right`, `top`, `bottom`, or `edges`.',
      cell: 'CSS pixels per dither cell.',
      fill: 'Fills the nearest positioned parent, for a section background.',
      ratio: 'CSS aspect ratio. Defaults to 16 / 9.',
    },
    related: ['Dither', 'DitherGlyph', 'Canvas'],
  },
  {
    component: 'Dither',
    summary: "A still image or gradient, redrawn in dots of the theme's colours.",
    use: {
      when: ['A picture should match the theme', 'A quiet textured band'],
      instead: [{ name: 'DitherField', why: 'it should move' }],
    },
    playground: {
      example: 'DitherPlay',
      code: '<Dither{props} />',
      knobs: [
        {
          prop: 'algorithm',
          control: 'select',
          options: ['bayer2', 'bayer4', 'bayer8', 'blue', 'halftone', 'floyd', 'atkinson'],
          initial: 'bayer8',
          default: 'bayer8',
        },
        {
          prop: 'ramp',
          control: 'select',
          options: ['accent', 'neutral', 'positive', 'caution', 'critical', 'info', 'highlight'],
          initial: 'accent',
          default: 'accent',
        },
        { prop: 'cell', control: 'slider', min: 2, max: 10, step: 1, initial: 4, default: 4 },
        { prop: 'invert', control: 'switch', initial: false, default: false },
      ],
      stage: 'fill',
      height: 420,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          fill(
            'DitherImage',
            'An image',
            420,
            'The real image stays underneath, so `alt` still works and a failed load still shows it.',
          ),
          fill('DitherGradient', 'A gradient', 320, 'With no `src`, it dithers a soft gradient.'),
          fill('DitherRadial', 'A radial gradient', 320, '`from` and `to` run from 0 to 1.'),
          fill(
            'DitherAlgorithms',
            'Algorithms',
            460,
            'Patterns stay steady and suit gradients. `floyd` and `atkinson` hold more detail in images.',
          ),
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          fill(
            'DitherBanner',
            'A status banner',
            280,
            'Use `gradient` and `ramp` to shade a banner, and `ratio` to set its shape.',
          ),
        ],
      },
    ],
    a11yNotes: ['An image keeps its `alt`. A gradient is decorative unless you give it a `label`.'],
    propDocs: {
      gradient: 'With no `src`: `{ angle, radial, from, to }`.',
      algorithm: '`atkinson` by default for images, `bayer8` for gradients.',
      invert: 'Swaps light and dark.',
      contrast: 'Tone contrast, around 1.',
    },
    related: ['DitherField', 'DitherGlyph'],
  },
  {
    component: 'DitherGlyph',
    summary: 'A word or logo woven out of a moving dithered field.',
    use: {
      when: ['A big brand moment: a wordmark or a logo'],
      instead: [{ name: 'Heading', why: 'it is ordinary text' }],
    },
    playground: {
      example: 'DitherGlyphPlay',
      code: '<DitherGlyph{props} />',
      knobs: [
        { prop: 'text', control: 'text', initial: 'weft', default: '' },
        {
          prop: 'kind',
          control: 'select',
          options: ['weave', 'flow', 'rings', 'aurora', 'drift'],
          initial: 'flow',
          default: 'flow',
        },
        {
          prop: 'ramp',
          control: 'select',
          options: ['accent', 'neutral', 'positive', 'info', 'highlight'],
          initial: 'accent',
          default: 'accent',
        },
        { prop: 'cell', control: 'slider', min: 2, max: 8, step: 1, initial: 4, default: 4 },
      ],
      stage: 'fill',
      height: 340,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          fill(
            'DitherGlyphWord',
            'A word',
            260,
            'The word stays in the page as real text, for readers and search.',
          ),
          fill('DitherGlyphLogo', 'A logo', 340, 'Pass an SVG `path` and its `box`.'),
          fill('DitherGlyphDrawn', 'Your own drawing', 340, '`draw` paints the shape in cells.'),
          {
            ...fill(
              'DitherGlyphReveal',
              'Reveal',
              260,
              '`reveal` draws the shape on over that many seconds.',
            ),
            replay: true,
          },
        ],
      },
    ],
    a11yNotes: ['A `text` glyph is real text. Give a `path` or `draw` glyph a `label`.'],
    propDocs: {
      ramp: 'The inks: a tone such as `accent`, or your own list of colours.',
      pattern: 'The ordered-dither tile: `bayer2`, `bayer4`, `bayer8`, `blue` noise or `halftone`.',
      pointer: 'How the field answers the pointer: `ripple`, `pull` or `shockwave`, or several.',
      fps: 'Caps the frame rate while it moves.',
      path: 'An SVG path, for a logo.',
      box: 'The size of the box the path was drawn in.',
      stroke: 'Line width, for a path made of lines.',
      fit: 'The share of the box the shape fills, 0 to 1.',
      draw: 'Paints the shape on a canvas, in cells.',
      font: 'The font for `text`.',
      weight: 'The font weight for `text`.',
    },
    related: ['DitherField', 'Dither'],
  },
]
