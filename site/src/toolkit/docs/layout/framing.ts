import type { Doc } from '../../types.ts'

export const framing: Doc[] = [
  {
    component: 'Frame',
    tile: 'FrameTile',
    tileStage: 'fill',
    summary: 'A box that holds its shape, for images, video and previews.',
    use: {
      when: [
        'Images and video that must not shift the page as they load',
        'Thumbnails of mixed sizes that should line up',
      ],
      instead: [{ name: 'Card', why: 'it needs a surface and padding' }],
    },
    playground: {
      example: 'FramePlay',
      code: '<Frame{props}>\n  <img src="/preview.png" alt="" />\n</Frame>',
      knobs: [
        {
          prop: 'ratio',
          control: 'select',
          options: ['21:9', '16:9', '3:2', '4:3', 'square', '3:4', '9:16'],
          initial: '16:9',
          default: '16:9',
        },
      ],
      height: 280,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'FrameRatios',
            title: 'Ratios',
            note: 'The sunken colour shows until the media arrives, so the page never jumps.',
            stage: 'fill',
            height: 200,
          },
          {
            id: 'FrameMedia',
            title: 'Media crops to fit',
            note: 'An image, video, canvas or SVG directly inside fills the frame and crops.',
            stage: 'fill',
            height: 300,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'FramePreviews',
            title: 'Deploy previews',
            note: 'Use `ratio` to give each preview the same shape, here 16:9.',
            stage: 'fill',
            height: 300,
          },
        ],
      },
    ],
    a11yNotes: ['Frame draws nothing itself, so give an image its `alt` as usual.'],
    propDocs: { ratio: 'Width to height. `16:9` by default.' },
    related: ['Card', 'Grid'],
  },
  {
    component: 'Inset',
    summary: 'A sunken, padded area that sets something apart inside a page or card.',
    use: {
      when: ['Logs, code and read-only values', 'A summary inside a form or a card'],
      instead: [
        { name: 'Card', why: 'it should rise above the page' },
        { name: 'Alert', why: 'it needs attention' },
      ],
    },
    playground: {
      example: 'InsetPlay',
      code: '<Inset{props}>\n  <Box>The sunken area is the Inset</Box>\n</Inset>',
      knobs: [
        {
          prop: 'pad',
          control: 'segmented',
          options: ['group', 'section'],
          initial: 'group',
          default: 'group',
        },
      ],
      height: 200,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'InsetPads',
            title: 'Padding',
            note: 'Two sizes from the space scale.',
            stage: 'fill',
            height: 160,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'InsetBuildLog',
            title: 'Build output',
            note: 'Use `Inset` to set a block of output apart inside a card.',
            stage: 'narrow',
            height: 260,
          },
          {
            id: 'InsetInvoiceTotal',
            title: 'An invoice summary',
            note: 'Use `Inset` to set a summary apart from the text around it.',
            stage: 'narrow',
            height: 300,
          },
        ],
      },
    ],
    propDocs: { pad: 'The padding: `group`, or `section` for more.' },
    related: ['Card', 'Stack'],
  },
  {
    component: 'Spacer',
    summary: 'Takes up the free space in a Row or Stack, so what follows sits at the far end.',
    use: {
      when: ['A toolbar with items at both ends', 'A card whose button sits at the bottom'],
      instead: [{ name: 'Row', why: 'two groups apart is all you need: use `justify="between"`' }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'SpacerInRow',
            title: 'In a Row',
            note: "Everything after it goes to the far end. The sunken area shows the row's width.",
            stage: 'fill',
            height: 130,
          },
          {
            id: 'SpacerInStack',
            title: 'In a Stack',
            note: 'A Stack needs a height for there to be free space.',
            stage: 'fill',
            height: 300,
          },
          {
            id: 'SpacerTwo',
            title: 'Two spacers',
            note: "They share the free space evenly, which centres what's between them.",
            stage: 'fill',
            height: 130,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SpacerToolbar',
            title: 'A toolbar',
            note: 'Put a `Spacer` between items in a row to push the ones after it to the far end.',
            stage: 'fill',
            height: 120,
          },
          {
            id: 'SpacerCardFooter',
            title: 'Buttons along the bottom',
            note: 'Two cards of different lengths still line up their buttons.',
            stage: 'fill',
            height: 260,
          },
        ],
      },
    ],
    a11yNotes: ['It is an empty box with no role, so screen readers skip it.'],
    related: ['Row', 'Stack'],
  },
  {
    component: 'Shell',
    summary:
      'The frame of an app: header, navigation and main area, reshaping itself from phone to desktop.',
    use: {
      when: [
        'The outermost layout of a signed-in app',
        'A wizard or checkout: `variant="focus"` drops the navigation',
      ],
      instead: [
        { name: 'Split', why: 'it is a sidebar inside a page' },
        { name: 'Cover', why: 'the page has no navigation at all' },
      ],
    },
    tile: 'ShellRail',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'ShellApp',
            title: 'The app',
            note: 'Press the nav items and the account button. It answers to its own width: at 1000px and up it draws the full sidebar, below that a rail, and below 600px bottom tabs.',
            stage: 'fill',
            height: 664,
          },
          {
            id: 'ShellRail',
            title: 'Collapsed to a rail',
            note: 'Bind `collapsed` to a state to keep it. Press `[`, or the toggle at the foot of the rail.',
            stage: 'fill',
            height: 484,
          },
          {
            id: 'ShellFocus',
            title: 'Focus',
            note: '`variant="focus"` has no navigation: Close, a title and the step, with `dock` for the main action.',
            stage: 'fill',
            height: 484,
          },
        ],
      },
      {
        kind: 'states',
        title: 'Phone',
        examples: [
          {
            id: 'ShellPhone',
            title: 'Bottom tabs',
            note: 'The first four items become tabs. The rest move into More, or mark your own with `tab`.',
            stage: 'fill',
            height: 624,
          },
          {
            id: 'ShellChildPage',
            title: 'A child page',
            note: '`depth="child"` with `back` swaps the brand for a back button.',
            stage: 'fill',
            height: 484,
          },
        ],
      },
      {
        kind: 'prose',
        title: 'Showing a shell inside a page',
        md: "A shell fills the screen by default, which is what you want in an app: put it at the top of your layout and nothing else is needed.\n\nTo preview one inside a page, as here, pass `island` so the page keeps its one `<main>`, set `--warp-viewport-block` to the height you want, and give the box around it `contain: layout` so the shell's overlays stay inside. The `AppWindow` helper in these examples does exactly that.",
      },
    ],
    keyboard: [
      ['[', 'Collapses or expands the sidebar'],
      ['⌘ K', 'Runs `command`, when it is set'],
      ['Esc', 'Closes the open navigation'],
      ['Tab', 'The first stop is Skip to content'],
    ],
    a11yNotes: [
      'Parts are props rather than children, so the focus order is always skip link, brand, header, navigation, main, dock.',
      "A change to `current` announces the new page's `h1`, so give every page one.",
      'With `island`, main becomes a named region, since a document has one `<main>`.',
    ],
    propDocs: {
      brand: "The product's name and mark. Shown in the header, and as the home link.",
      nav: 'Groups of items. The first is the main list; the rest are extras such as saved views, in the sidebar only.',
      foot: 'Items pinned to the bottom of the navigation.',
      current:
        'The `id` of the current item. A change plays the route line and announces the page.',
      crumbs: 'The path in the header from tablet up. The last is the current page.',
      title: "The phone header's title.",
      actions: 'Your own buttons in the header.',
      account: 'The account button and its menu.',
      switcher: 'A workspace switcher above the navigation.',
      command: 'A search field in the header. It takes over ⌘K.',
      collapsed: 'A state: `false`, `true` for the rail, or `hidden` for an edge tab.',
      dock: "A sticky bar under the content, for the page's main action.",
      overlays: 'Dialogs, toasts and palettes, kept outside main.',
      island: 'For a shell inside a page: main becomes a named region.',
    },
    related: ['Split', 'Cover', 'Nav', 'Menu'],
  },
]
