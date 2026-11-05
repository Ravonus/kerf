import type { Doc } from '../../types.ts'

export const feedbackStatus: Doc[] = [
  {
    component: 'Spinner',
    summary: "Shows that something is working, when you can't say how long it will take.",
    use: {
      when: ['A short wait of unknown length', 'A small area is busy'],
      instead: [
        { name: 'Progress', why: 'you know how far along it is' },
        { name: 'Skeleton', why: 'you know the shape of what is coming' },
        { name: 'Button', why: 'the button itself started it: use loading' },
      ],
    },
    playground: {
      example: 'SpinnerPlay',
      code: '<Spinner{props} />',
      knobs: [
        {
          prop: 'size',
          control: 'segmented',
          options: ['sm', 'md', 'lg'],
          initial: 'md',
          default: 'md',
        },
        { prop: 'label', control: 'text', initial: 'Loading', default: '' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'SpinnerSizes', title: 'Sizes' },
          {
            id: 'SpinnerInline',
            title: 'Beside text',
            note: 'With words next to it, leave out `label`: it is then decorative.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SpinnerRefresh',
            title: 'Refreshing',
            note: 'A spinner with a `label` stands in for a button while a refresh runs.',
            stage: 'narrow',
          },
          {
            id: 'SpinnerPanel',
            title: 'A waiting panel',
            note: 'Use `size` set to `lg` for a spinner that fills a waiting panel.',
            stage: 'narrow',
            height: 220,
          },
        ],
      },
    ],
    a11yNotes: [
      '`label` makes it a named status. Without one it is hidden from screen readers.',
      'Under reduced motion it pulses instead of turning.',
    ],
    propDocs: {
      label: 'Names it for screen readers. Leave it out if there are words beside it.',
      size: '`sm`, `md` or `lg`.',
    },
    related: ['Progress', 'Skeleton', 'Button'],
  },
  {
    component: 'Skeleton',
    summary: 'A grey placeholder where content will appear.',
    use: {
      when: ['Building your own loading state, piece by piece'],
      instead: [
        { name: 'Shape', why: 'the content is a plain list, card or table' },
        { name: 'Spinner', why: "you don't know the shape of what is coming" },
      ],
    },
    playground: {
      example: 'SkeletonPlay',
      code: '<Skeleton{props} />',
      stage: 'narrow',
      knobs: [
        {
          prop: 'shape',
          control: 'segmented',
          options: ['text', 'circle', 'block'],
          initial: 'text',
          default: 'text',
        },
        { prop: 'lines', control: 'slider', min: 1, max: 6, step: 1, initial: 3, default: 1 },
        { prop: 'width', control: 'text', initial: '', default: '' },
        { prop: 'height', control: 'text', initial: '', default: '' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'SkeletonShapes', title: 'Shapes', stage: 'narrow', height: 240 },
          {
            id: 'SkeletonLines',
            title: 'Lines',
            note: '`lines` stacks text lines. The last is shorter.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SkeletonProfile',
            title: 'A person row',
            note: 'Use `shape` and `width` to sketch a person row while it loads.',
          },
          {
            id: 'SkeletonThenContent',
            title: 'Then the content',
            note: "Match the content's size, so nothing jumps.",
            stage: 'narrow',
            replay: true,
          },
        ],
      },
    ],
    a11yNotes: [
      'Skeletons say nothing to screen readers. Put `aria-busy` on the region, or use Shape, which does it for you.',
      'Under reduced motion they stay still.',
    ],
    propDocs: {
      shape: '`text`, `circle` or `block`.',
      lines: 'How many text lines.',
      width: 'Any CSS length.',
      height: 'Any CSS length.',
    },
    related: ['Shape', 'Spinner'],
  },
  {
    component: 'Shape',
    summary: 'A ready-made loading placeholder for a list, card, table or block of text.',
    use: {
      when: [
        'As the pending of a Boundary',
        'Any loading state that looks like a list, card or table',
      ],
      instead: [
        { name: 'Skeleton', why: 'the layout is unusual and you need to build it by hand' },
      ],
    },
    playground: {
      example: 'ShapePlay',
      code: '<Shape{props} />',
      stage: 'narrow',
      height: 280,
      knobs: [
        {
          prop: 'kind',
          control: 'segmented',
          options: ['text', 'list', 'card', 'media', 'table'],
          initial: 'list',
          default: 'text',
        },
        {
          prop: 'rows',
          control: 'slider',
          min: 1,
          max: 8,
          step: 1,
          initial: 3,
          default: 3,
          when: { prop: 'kind', is: ['list', 'table'] },
        },
        {
          prop: 'lines',
          control: 'slider',
          min: 1,
          max: 6,
          step: 1,
          initial: 3,
          default: 3,
          when: { prop: 'kind', is: ['text', 'card'] },
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'ShapeList',
            title: 'List',
            note: '`avatar={false}` drops the circle.',
            stage: 'narrow',
            height: 220,
          },
          {
            id: 'ShapeParagraph',
            title: 'Text',
            note: 'Use `kind="text"` with `lines` to draw a placeholder paragraph.',
            stage: 'narrow',
          },
          {
            id: 'ShapeTile',
            title: 'Card',
            note: "`media` is the picture's ratio. Leave it out for none.",
            stage: 'narrow',
            height: 340,
          },
          {
            id: 'ShapeTable',
            title: 'Table',
            note: 'Use `kind="table"` with `rows` and `cols` to draw a placeholder table.',
            stage: 'fill',
            height: 240,
          },
          {
            id: 'ShapeMedia',
            title: 'Media',
            note: 'Use `kind="media"` with `media` to draw a placeholder image at a set ratio.',
            stage: 'fill',
            height: 260,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ShapeBoundary',
            title: 'Waiting on data',
            note: "Give it the content's counts, so the swap moves nothing.",
            stage: 'narrow',
            height: 200,
            replay: true,
          },
        ],
      },
    ],
    a11yNotes: ['It is a busy status named by `label`, and nothing inside it can be focused.'],
    propDocs: {
      label: 'What screen readers hear.',
      kind: 'Which layout: `text`, `list`, `card`, `media` or `table`.',
      lines: 'Text and card: lines of body text.',
      rows: 'List and table: how many rows.',
      cols: 'Table: how many columns.',
      media: 'Card and media: the ratio, like `"16/9"`.',
      avatar: 'List: a circle at the start of each row.',
    },
    related: ['Skeleton', 'Spinner'],
  },
  {
    component: 'LiveStatus',
    summary: 'A small pill saying whether a live connection is working.',
    use: {
      when: ['Anything that streams, syncs or updates by itself'],
      instead: [
        { name: 'Badge', why: 'it is a fixed status, not a connection' },
        { name: 'Alert', why: 'the connection has been lost and people must act' },
      ],
    },
    playground: {
      example: 'LiveStatusPlay',
      code: '<LiveStatus{props}>{children}</LiveStatus>',
      knobs: [
        {
          prop: 'state',
          control: 'segmented',
          options: ['connecting', 'live', 'reconnecting', 'offline'],
          initial: 'live',
          default: '',
        },
        { prop: 'label', control: 'text', initial: 'Log stream', default: '' },
        { prop: 'children', control: 'text', label: 'Words', initial: '', default: '' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'LiveStatusStates',
            title: 'States',
            note: 'Quiet while live, loud only in trouble.',
          },
          {
            id: 'LiveStatusWords',
            title: 'Your own words',
            note: 'Children replace the default word.',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'LiveStatusDrop',
            title: 'Losing the connection',
            note: 'Pass the state you have, and it follows.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'LiveStatusHeader',
            title: 'A panel header',
            note: 'Use `state` and `label` to show whether a stream is live beside a heading.',
            stage: 'narrow',
          },
        ],
      },
    ],
    a11yNotes: [
      'It is a live status, so changes are announced. `label` says what the connection is for.',
    ],
    propDocs: {
      state: 'The connection: `connecting`, `live`, `reconnecting` or `offline`.',
      label: 'What is connected, for screen readers: "Log stream: live".',
      children: 'Replaces the default word.',
    },
    related: ['Badge', 'Alert'],
  },
]
