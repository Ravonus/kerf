import type { DocGroup, ExampleRef } from '../types.ts'

const fill = (id: string, title: string, height: number, note?: string): ExampleRef => ({ id, title, stage: 'fill', height, note })

export const canvas: DocGroup = {
  file: 'canvas',
  title: 'Canvas and dithering',
  intro: "Drawings that use warp's colours, follow the theme and pause off screen.",
  docs: [
    {
      component: 'Canvas',
      summary: 'A canvas that handles sizing, sharp pixels, off-screen pausing and reduced motion for you.',
      use: {
        when: ['You need to draw something warp has no component for'],
        instead: [{ name: 'DitherField', why: 'a textured background is enough' }, { name: 'BarChart', why: 'it is data people need to read exactly' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          fill('CanvasBars', 'One drawing', 260, '`draw` gets a scaled context. Resolve a token through CSS before you paint with it. Returning true asks for another frame.'),
          fill('CanvasWave', 'Animated', 260, '`animate` runs every frame. Quiet and reduced motion get one still frame.'),
          fill('CanvasPointer', 'Follows the pointer', 260, '`pointer` fills `frame.pointer` and repaints when it moves. Move across the dots.'),
          fill('CanvasCells', 'Whole cells', 260, '`cell` draws in big square pixels. `fps` slows the clock.'),
        ] },
      ],
      a11yNotes: ['With `label` it is an image with that name. Without one it is decorative and hidden from screen readers.', 'Canvas has a size of zero until its container has one, so set a height.'],
      propDocs: { draw: 'Paints one frame. Read colours from warp\'s tokens so the theme applies.', onTheme: 'Called when the theme changes. Refresh any colours you keep here.' },
      related: ['DitherField', 'Dither'],
    },
    {
      component: 'DitherField',
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
      propDocs: { kind: 'The named field, or your own function of `(x, y, t)`.', spark: 'The colours a disturbed cell takes.', fade: 'Dissolves toward `left`, `right`, `top`, `bottom`, or `edges`.', cell: 'CSS pixels per dither cell.', fill: 'Fills the nearest positioned parent, for a section background.', ratio: 'CSS aspect ratio. Defaults to 16 / 9.' },
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
        { kind: 'composition', title: 'In context', examples: [fill('DitherBanner', 'A status banner', 280)] },
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
          { prop: 'text', control: 'text', initial: 'Tessel', default: '' },
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
      propDocs: { path: 'An SVG path, for a logo.', box: 'The size of the box the path was drawn in.', stroke: 'Line width, for a path made of lines.', fit: 'The share of the box the shape fills, 0 to 1.', draw: 'Paints the shape on a canvas, in cells.', font: 'The font for `text`.', weight: 'The font weight for `text`.' },
      related: ['DitherField', 'Dither'],
    },
  ],
}
