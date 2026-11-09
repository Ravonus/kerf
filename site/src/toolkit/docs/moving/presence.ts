import type { Doc } from '../../types.ts'

export const presence: Doc[] = [
  {
    component: 'Presence',
    summary:
      'Shows and hides its content with an entrance and an exit, so nothing on the page appears or vanishes in a cut.',
    tileWidth: 320,
    use: {
      when: [
        'A block of the page that comes and goes: details, a note, an extra field',
        "Your own component that opens and closes and should move like Warp's do",
      ],
      instead: [
        { name: 'Accordion', why: 'there is a heading to press for each section' },
        { name: 'Modal', why: 'it should sit over the page and take focus' },
        { name: 'Popover', why: 'it belongs to one control and floats beside it' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'PresenceToggle',
            title: 'Collapse',
            note: 'The default grows from nothing to its height and fades in, and shrinks and fades before it leaves the layout. The same with no component: `hidden` plus `data-collapse` on any element.',
            height: 180,
          },
          {
            id: 'PresenceRise',
            title: 'Rise',
            note: '`motion` keeps the size and arrives by `fade`, `rise`, `pop` or `slide-up`, `slide-down`, `slide-left`, `slide-right`; the exit runs back the way it came, faster. No component: `data-presence="rise"` and `hidden`. For an overlay of your own, put the exit on `[data-state="closed"]` and close it with `leave(el, done)` from `@weft-js/warp-core/motion`.',
            height: 140,
          },
        ],
      },
    ],
    keyboard: [],
    a11yNotes: [
      'Hidden content is `hidden`: out of the tab order and the accessibility tree once its exit ends.',
      'Under reduced motion it fades, with no travel or growth.',
    ],
    propDocs: {
      when: 'Shown while true. Its content stays mounted while hidden, so what it holds survives a close.',
      motion:
        '`collapse` (default), `fade`, `rise`, `pop`, `slide-up`, `slide-down`, `slide-left` or `slide-right`.',
    },
    related: ['Accordion', 'Modal', 'Popover'],
  },
]
