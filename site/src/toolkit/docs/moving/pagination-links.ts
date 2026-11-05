import type { Doc } from '../../types.ts'

export const paging: Doc[] = [
  {
    component: 'PaginationBar',
    summary: 'Moves through a long list a page at a time.',
    use: {
      when: [
        'A list people jump around in, or link to a page of',
        'You know the total, or at least whether there is more',
      ],
      instead: [
        { name: 'LoadMore', why: 'people read straight down a feed' },
        { name: 'VirtualList', why: 'it is one long list that scrolls' },
      ],
    },
    playground: {
      example: 'PaginationBarPlay',
      code: '<PaginationBar label="Projects" page={page}{props} />',
      stage: 'fill',
      knobs: [
        {
          prop: 'total',
          control: 'slider',
          min: 10,
          max: 5000,
          step: 10,
          initial: 1240,
          default: 0,
        },
        { prop: 'size', control: 'select', options: [10, 25, 50, 100], initial: 25, default: 25 },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'PaginationBarOffset',
            title: 'Numbered pages',
            note: 'The default: rows per page, the range, the pages and Go to.',
            stage: 'fill',
            height: 120,
          },
          {
            id: 'PaginationBarCursor',
            title: 'Previous and Next',
            note: '`mode="cursor"` is for a list with no page count. You move `pageIndex`.',
            stage: 'fill',
            height: 120,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'PaginationBarNarrow',
            title: 'In a small space',
            note: 'Under 520px of its own width only the arrows and the current page stay.',
            stage: 'narrow',
            height: 120,
          },
          {
            id: 'PaginationBarControlled',
            title: 'Moved from outside',
            note: 'Pass a `state` as `page` and write to it from anywhere.',
            stage: 'fill',
            height: 170,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'PaginationBarList',
            title: 'Paging a list',
            note: 'Pass `page`, `size`, `sizes` and `total` to move through a long list a few rows at a time.',
            stage: 'fill',
            height: 340,
          },
        ],
      },
    ],
    keyboard: [
      ['Tab', 'Moves between the page buttons'],
      ['Enter', 'Goes to that page, or the number typed in Go to'],
    ],
    a11yNotes: [
      'After a press, focus moves to the new current page, so it is never lost when a button goes away.',
    ],
    propDocs: {
      label: 'The name of the navigation landmark.',
      total: 'How many rows there are, in numbered mode.',
      size: 'Rows per page. Pass a `state` so the rows-per-page select can change it.',
      sizes: 'What the rows-per-page select offers.',
      pageIndex: 'Cursor mode: which page this is, from 0.',
      hasMore: 'Cursor mode: enables Next.',
      hasPrev: 'Cursor mode: enables Previous.',
      supply: 'Cursor mode: the total, when you happen to know it.',
      totalFetched: 'Cursor mode: how many rows are showing, when pages differ in size.',
    },
    related: ['LoadMore', 'Table', 'DataGrid'],
  },
  {
    component: 'LoadMore',
    summary: 'Adds the next page to the bottom of a list, by scrolling or with a button.',
    use: {
      when: ['A feed people read from the top down'],
      instead: [{ name: 'PaginationBar', why: 'people need to find their way back to a place' }],
    },
    playground: {
      example: 'LoadMorePlay',
      code: '<LoadMore{props} loading={loading.value} done={done()} onLoad={load} />',
      stage: 'narrow',
      height: 300,
      knobs: [
        { prop: 'auto', control: 'switch', initial: false, default: true },
        { prop: 'message', control: 'text', initial: 'That is every project.', default: '' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'LoadMoreOnPress',
            title: 'With a button',
            note: '`auto={false}` waits for a press. Draw your own loading rows while `loading` is on.',
            stage: 'narrow',
            height: 300,
          },
          {
            id: 'LoadMoreScrolling',
            title: 'While scrolling',
            note: 'Loads as the end comes near. Pass `root` when the list scrolls in its own box.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'LoadMoreLoading',
            title: 'Loading',
            note: 'The button stays, disabled, and the words are announced.',
          },
          {
            id: 'LoadMoreDone',
            title: 'Nothing left',
            note: '`done` swaps the button for your `message`.',
          },
        ],
      },
    ],
    a11yNotes: [
      'The button is always there, even with `auto`, so nobody depends on scrolling.',
      'The message is announced as it changes.',
    ],
    propDocs: {
      onLoad: 'Called when more is wanted, by a press or by reaching the end.',
      loading: 'A page is on its way. Stops further calls.',
      done: 'There is nothing left. Removes the button.',
      message: 'Words beside the button, or in its place once `done`.',
      auto: 'Load when the end scrolls into view.',
      root: "The box that scrolls, if it isn't the window.",
    },
    related: ['PaginationBar', 'VirtualList', 'Feed'],
  },
  {
    component: 'Link',
    summary: 'Text that goes to another page.',
    use: {
      when: ['The press takes people somewhere else'],
      instead: [
        { name: 'Button', why: 'the press changes something here' },
        { name: 'Nav', why: 'it is one of a set of page links' },
      ],
    },
    playground: {
      example: 'LinkPlay',
      code: '<Link href="/toolkit/button"{props}>{children}</Link>',
      knobs: [
        {
          prop: 'children',
          control: 'text',
          label: 'Label',
          initial: 'Read the guide',
          default: '',
        },
        { prop: 'subtle', control: 'switch', initial: false, default: false },
        { prop: 'external', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'LinkInText',
            title: 'In a sentence',
            note: 'Underlined, so it reads as a link without colour.',
            stage: 'narrow',
          },
          {
            id: 'LinkSubtle',
            title: 'Subtle',
            note: '`subtle` takes the colour of the text around it.',
            stage: 'narrow',
          },
          {
            id: 'LinkExternal',
            title: 'External',
            note: '`external` opens a new tab, and tells screen readers it will.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'LinkCardAction',
            title: 'The next step on a card',
            note: 'A `Link` inside a card points to the next step.',
            stage: 'narrow',
            height: 220,
          },
          {
            id: 'LinkFooter',
            title: 'Footer links',
            note: 'Use `subtle` for quiet links and `external` for ones that leave the site.',
          },
        ],
      },
    ],
    keyboard: [['Enter', 'Follows the link']],
    a11yNotes: ['Write link text that makes sense alone: "Read the guide", not "click here".'],
    propDocs: {
      href: 'Where it goes.',
      subtle: 'Takes the surrounding text colour.',
      external:
        'Opens in a new tab with `rel="noopener noreferrer"`, and says so to screen readers.',
    },
    related: ['Button', 'Nav'],
  },
]
