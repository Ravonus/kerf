import type { Doc } from '../../types.ts'
import { GAP_OPTIONS } from './flow.ts'

export const placement: Doc[] = [
  {
    component: 'Split',
    tile: 'SplitTile',
    tileStage: 'fill',
    summary: 'A fixed side next to a fluid main area, stacked when the container is narrow.',
    use: {
      when: [
        'Settings with a list of sections',
        'A list next to its detail',
        'A page with a sidebar inside the content',
      ],
      instead: [
        { name: 'Grid', why: 'the columns are equal' },
        { name: 'Shell', why: 'this is the whole app frame' },
      ],
    },
    playground: {
      example: 'SplitPlay',
      code: '<Split{props}>\n  <Box>Side</Box>\n  <Box>Main</Box>\n</Split>',
      knobs: [
        {
          prop: 'width',
          control: 'select',
          options: ['aside', 'rail', 'nav', 'list', 'half'],
          initial: 'aside',
          default: 'aside',
        },
        {
          prop: 'side',
          control: 'segmented',
          options: ['start', 'end'],
          initial: 'start',
          default: 'start',
        },
        {
          prop: 'at',
          control: 'segmented',
          options: ['tablet', 'desktop'],
          initial: 'tablet',
          default: 'tablet',
        },
        {
          prop: 'gap',
          control: 'select',
          options: GAP_OPTIONS,
          initial: 'section',
          default: 'section',
        },
      ],
      presets: [
        { label: 'Settings', values: { width: 'nav', side: 'start', gap: 'section' } },
        { label: 'Inspector', values: { width: 'aside', side: 'end', gap: 'group' } },
        { label: 'Even', values: { width: 'half', gap: 'group' } },
      ],
      stage: 'fill',
      height: 220,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'SplitWidths',
            title: 'Side width',
            note: 'Named widths: `rail` 80px, `nav` 220px, `aside` 300px (the default), `list` 340px, and `half` for two equal sides.',
            stage: 'fill',
            height: 240,
          },
          {
            id: 'SplitSides',
            title: 'Which side',
            note: '`side="end"` fixes the second child, so the first one is the fluid one.',
            stage: 'fill',
            height: 200,
          },
          {
            id: 'SplitSteps',
            title: 'When it stacks',
            note: "It answers to its container, not the screen. Set the stage's Width to Tablet: the `desktop` one stacks first.",
            stage: 'fill',
            height: 220,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SplitSettings',
            title: 'A settings page',
            note: "Pick a section. Each side is a container, so what's inside reflows by its own width.",
            stage: 'fill',
            height: 360,
          },
          {
            id: 'SplitMasterDetail',
            title: 'List and detail',
            note: 'Use `width` to size the list column, and the detail takes the rest.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
    ],
    a11yNotes: [
      'Stacked, the children keep source order, so put what people need first first. `side` changes which one is fixed, not the order.',
    ],
    propDocs: {
      width: 'The fixed side: `rail`, `nav`, `list` or `half`. Default 300px.',
      side: 'Which child is fixed. `start` is the first, `end` the last.',
      at: 'When it becomes two columns: `tablet` at 600px of container, `desktop` at 1000px.',
      gap: 'The space between the sides, from the space scale.',
    },
    related: ['Grid', 'Shell', 'Stack'],
  },
  {
    component: 'Center',
    summary: 'A column of readable width, centred in whatever holds it.',
    use: {
      when: [
        'Articles and other long text',
        'Sign-in and other single forms',
        "Keeping a page's content from getting too wide",
      ],
      instead: [{ name: 'Cover', why: 'it should centre vertically too' }],
    },
    playground: {
      example: 'CenterPlay',
      code: '<Center{props}>\n  <Box>A measured column</Box>\n</Center>',
      knobs: [
        {
          prop: 'max',
          control: 'select',
          options: ['narrow', 'measure', 'content', 'wide'],
          initial: 'narrow',
          default: 'content',
        },
        { prop: 'gutter', control: 'switch', initial: false, default: false },
        { prop: 'intrinsic', control: 'switch', initial: false, default: false },
      ],
      stage: 'fill',
      height: 200,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'CenterWidths',
            title: 'Widths',
            note: '`narrow` 440px for forms, `measure` about 70 characters for reading, `content` 1160px for pages. `wide` is 1440px.',
            stage: 'fill',
            height: 200,
          },
          {
            id: 'CenterGutter',
            title: 'Gutter',
            note: "`gutter` adds the page's side margin and clears a phone's notch.",
            stage: 'fill',
            height: 180,
          },
          {
            id: 'CenterIntrinsic',
            title: 'Centre the content too',
            note: '`intrinsic` also centres each child at its own width.',
            stage: 'fill',
            height: 220,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CenterArticle',
            title: 'An article',
            note: 'Use `max` set to `measure` to hold text to a comfortable line length.',
            stage: 'fill',
            height: 280,
          },
        ],
      },
    ],
    propDocs: {
      max: 'How wide it may get: `narrow`, `measure`, `content` or `wide`.',
      gutter: "Adds the page's side margin, and the safe areas on a phone.",
      intrinsic: 'Centres each child at its own width, and centres text.',
    },
    related: ['Cover', 'Stack', 'Split'],
  },
  {
    component: 'Cover',
    summary: 'Fills the screen and centres one thing, with a header and footer at the edges.',
    use: {
      when: ['Sign-in and sign-up pages', 'Error and empty pages', 'A landing hero'],
      instead: [
        { name: 'Center', why: 'it only needs to centre across, not down' },
        { name: 'Shell', why: 'the page has navigation' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'CoverParts',
            title: 'The parts',
            note: 'The child with `data-part="center"` takes the free space. Whatever comes before and after hugs the edges.',
            stage: 'fill',
            height: 420,
          },
          {
            id: 'CoverFill',
            title: 'Inside a box',
            note: '`min="fill"` fills its parent instead of the screen.',
            stage: 'fill',
            height: 340,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CoverSignIn',
            title: 'A sign-in page',
            note: "Previews pin the screen's height with `--warp-viewport-block`. In an app, leave that out.",
            stage: 'fill',
            height: 580,
          },
          {
            id: 'CoverNotFound',
            title: 'A not found page',
            note: 'Use `Cover` to fill the screen and `Center` to put a message in the middle.',
            stage: 'fill',
            height: 420,
          },
        ],
      },
    ],
    a11yNotes: ['It sets no landmark. Pass `as="main"` when it is the page.'],
    propDocs: {
      min: '`screen` fills the viewport, `fill` fills its parent.',
      gap: 'The least space kept between the parts, from the space scale.',
    },
    related: ['Center', 'Shell', 'SignIn'],
  },
]
