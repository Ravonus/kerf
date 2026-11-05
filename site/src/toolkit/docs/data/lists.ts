import type { DocGroup } from '../../types.ts'

export const lists: DocGroup['docs'] = [
  {
    component: 'VirtualList',
    summary: 'A very long list that stays fast, because only the rows on screen exist.',
    use: {
      when: [
        'Logs, messages and search results in the thousands',
        'Any list that scrolls inside a fixed height',
      ],
      instead: [
        { name: 'Table', why: 'the rows have sortable columns' },
        { name: 'Feed', why: 'it is a stream of activity' },
        { name: 'PaginationBar', why: 'people look for a place rather than scroll' },
      ],
    },
    playground: {
      example: 'VirtualListPlay',
      code: '<VirtualList label="Request log" items={lines} rowKey={l => l.id}{props}>\n  {line => <LogLine line={line()} />}\n</VirtualList>',
      knobs: [
        {
          prop: 'height',
          control: 'segmented',
          options: ['240px', '320px', '400px'],
          initial: '320px',
          default: '',
        },
        { prop: 'gap', control: 'slider', min: 0, max: 16, step: 2, initial: 0, default: 0 },
        {
          prop: 'estimate',
          control: 'slider',
          min: 24,
          max: 80,
          step: 2,
          initial: 38,
          default: 48,
        },
      ],
      stage: 'fill',
      height: 384,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'VirtualListLog',
            title: '10,000 rows',
            note: 'Scroll as fast as you like: about twenty rows exist at any moment.',
            stage: 'fill',
            height: 424,
          },
          {
            id: 'VirtualListTallRows',
            title: 'Rows of different heights',
            note: "Each row is measured when it renders, and what's on screen never moves. Mark the text `data-measure` and pass `text`.",
            stage: 'fill',
            height: 424,
          },
          {
            id: 'VirtualListJump',
            title: 'Jumping to a row',
            note: '`control` hands you `scrollTo`, `scrollToEnd` and `focus`.',
            stage: 'fill',
            height: 420,
          },
          {
            id: 'VirtualListKeys',
            title: 'Keyboard rows',
            note: '`roving` gives one tab stop, then arrows, Home and End. Enter picks a row here.',
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
            id: 'VirtualListTail',
            title: 'A live log',
            note: '`stick` follows new rows while you\'re near the end. Scroll up and it stops. `from="end"` starts at the bottom.',
            stage: 'fill',
            height: 400,
          },
          {
            id: 'VirtualListLoadMore',
            title: 'Loading more',
            note: '`onEnd` fires near the end, once per length.',
            stage: 'fill',
            height: 380,
          },
        ],
      },
    ],
    keyboard: [
      ['↑ ↓', 'With `roving`, moves between rows'],
      ['Home, End', 'With `roving`, goes to the first or last row'],
    ],
    a11yNotes: [
      'Rows carry `aria-posinset` and `aria-setsize`, so a screen reader hears "12 of 10,000".',
      'Pass `label`. It names the list.',
      'A live list that may grow should use `role="log"` and `open`.',
    ],
    propDocs: {
      children: 'Draws a row. It gets the item and its index as functions, so a row can be reused.',
      rowKey: 'What identifies a row.',
      estimate: "A row's height before it is measured. Close is better. Default 48.",
      height: "The scroller's height. Default 280px.",
      gap: 'Pixels between rows.',
      stick: 'Stay at the end as rows arrive, while within this many pixels of it.',
    },
    related: ['Feed', 'ScrollGrid', 'Table'],
  },
  {
    component: 'Feed',
    summary: 'A long stream of activity, with each event as a knot on a line.',
    use: {
      when: [
        'Audit trails and activity on a project',
        'An endless stream that loads as you scroll',
      ],
      instead: [
        { name: 'VirtualList', why: 'the rows are not events in time' },
        { name: 'Table', why: 'people sort and compare' },
      ],
    },
    playground: {
      example: 'FeedPlay',
      code: '<Feed label="Activity" items={activity}{props} />',
      knobs: [
        {
          prop: 'height',
          control: 'segmented',
          options: ['280px', '360px', '480px'],
          initial: '360px',
          default: '480px',
        },
        { prop: 'busy', control: 'switch', initial: false, default: false },
      ],
      stage: 'fill',
      height: 424,
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'FeedActivity',
            title: 'Activity',
            note: "300 events, and only what's on screen exists.",
            stage: 'fill',
            height: 464,
          },
          {
            id: 'FeedLoadMore',
            title: 'Loading more',
            note: '`onEnd` asks for the next page near the end, and `busy` tells assistive technology.',
            stage: 'fill',
            height: 440,
          },
          {
            id: 'FeedCustom',
            title: 'Your own item',
            note: '`children` draws the whole item, here with a coloured knot and a badge. Keep the `data-part`s and it stays on the thread.',
            stage: 'fill',
            height: 404,
          },
        ],
      },
    ],
    keyboard: [
      ['Page Down', 'Moves to the next event'],
      ['Page Up', 'Moves to the previous event'],
      ['↑ ↓', 'Moves between events'],
      ['Home, End', 'Goes to the first or last event'],
    ],
    a11yNotes: ['It follows the APG feed pattern: each event is an `article` inside a `feed`.'],
    propDocs: {
      items: 'Each with `id` and `what`, and optional `when`, `detail` and `tone`.',
      height: "The scroller's height. Default 480px.",
      busy: 'More is loading.',
      onEnd: 'Called near the end, to load more.',
    },
    related: ['VirtualList', 'ActivityFeed', 'Table'],
  },
]
