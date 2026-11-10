import type { Doc } from '../../types.ts'

export const scrolling: Doc[] = [
  {
    component: 'ScrollView',
    summary:
      'A scroll area with bars you style or paint, kept moving by the compositor while the page is busy.',
    use: {
      when: [
        'A panel, list or log whose scrollbar must look the same on every platform',
        'A thumb of a fixed size, bars in your own colours, or bars painted on a canvas',
        'Snap points, or (with `mode="engine"`) your own easing and momentum',
      ],
      instead: [
        { name: 'ScrollRail', why: 'it is the whole page that scrolls' },
        { name: 'VirtualList', why: 'it is a long list of rows: it brings its own scroller' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'ScrollViewRows',
            title: 'A panel',
            note: 'The browser scrolls it, so wheel, trackpad, touch and find work as anywhere else, and the thumb follows on the compositor. The bar shows while it moves or is hovered.',
            stage: 'fill',
            height: 240,
          },
          {
            id: 'ScrollViewFixedThumb',
            title: 'Fixed thumb',
            note: '`thumb={{ size: 28 }}` keeps the thumb one size however long the content. `bar.show` and `bar.layout` keep it in view, in a gutter of its own.',
            stage: 'fill',
            height: 240,
          },
          {
            id: 'ScrollViewCanvas',
            title: 'Painted on a canvas',
            note: '`renderer={canvas({ draw })}` from `@weft-js/scroll/canvas` paints each bar; `paint` is the default look to draw over.',
            stage: 'fill',
            height: 240,
          },
          {
            id: 'ScrollViewSnap',
            title: 'Snap points',
            note: '`snap` rests on each `[data-slide]` once scrolling stops, as CSS scroll snapping does. An arrow key moves one slide.',
            stage: 'fill',
            height: 190,
          },
        ],
      },
    ],
    keyboard: [
      ['Arrow keys', 'Scroll by a line'],
      ['Page Up or Page Down', 'Scroll by most of a screen'],
      ['Space or Shift+Space', 'Scroll down or up by most of a screen'],
      ['Home or End', 'Go to the top or the bottom'],
    ],
    a11yNotes: [
      'The content stays in the DOM and in the accessibility tree; the viewport keeps real scroll offsets, so focus, find-in-page and screen readers reach every part of it.',
      'With `label`, the viewport is a named `region`. It is a tab stop only when nothing inside it can take focus.',
      'Each bar is a `scrollbar` with `aria-valuenow` and `aria-controls`.',
      'Under reduced motion, animated scrolls are instant and the bars stop fading.',
    ],
    propDocs: {
      axes: '`y`, `x` or `both` (default). An axis whose content fits shows no bar.',
      thumb: '`size` for a fixed thumb; else `min` and `max` bound a proportional one.',
      bar: 'Width, hover width, inset, radius, colours, `show`, `layout`, fade and track-press behaviour.',
      renderer: 'Draws the bars. Default: DOM elements styled by CSS. `canvas()` paints them.',
      label: 'The accessible name of the viewport, which makes it a `region`.',
      controller: 'Receives the scroller: `scrollTo`, `scrollIntoView`, `state` and the rest.',
    },
    related: ['ScrollRail', 'VirtualList'],
  },
]
