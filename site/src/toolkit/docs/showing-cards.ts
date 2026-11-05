import type { Doc } from '../types.ts'

export const cardDocs: Doc[] = [
  {
    component: 'Card',
    summary: 'A box that groups related things, and can be a link or a button.',
    use: {
      when: ["Grouping one thing's details", 'A grid of things to pick from'],
      instead: [
        { name: 'Table', why: 'people compare many rows by the same columns' },
        { name: 'Inset', why: 'you only want padding, with no surface' },
      ],
    },
    playground: {
      example: 'CardPlay',
      code: '<Card{props}>\n  <Text subtle>Live in eu-west, updated 2 minutes ago.</Text>\n</Card>',
      stage: 'narrow',
      height: 240,
      knobs: [
        { prop: 'eyebrow', control: 'text', initial: 'Project', default: '' },
        { prop: 'title', control: 'text', initial: 'storefront', default: '' },
        { prop: 'sweep', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'CardStatic', title: 'Static', stage: 'narrow' },
          {
            id: 'CardAsLink',
            title: 'A link',
            note: '`href` makes the whole card a link.',
            stage: 'narrow',
          },
          {
            id: 'CardPress',
            title: 'A button',
            note: '`onClick` makes the whole card a button.',
            stage: 'narrow',
          },
          {
            id: 'CardSweep',
            title: 'The hover line',
            note: '`sweep` opts a card in to the line that runs around its edge on hover. Without it, as on the right, a card has none.',
            stage: 'fill',
            height: 200,
          },
          {
            id: 'CardBare',
            title: 'Bare',
            note: 'Every part is optional, and `sweep={false}` leaves the hover line out even under `data-flair="sweep"`.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CardStats',
            title: 'A row of figures',
            note: 'Use `eyebrow` and `title` for a label and a figure, laid out in a `Grid`.',
            stage: 'fill',
            height: 180,
          },
          {
            id: 'CardProjectGrid',
            title: 'A grid of projects',
            note: 'Give a card `href` to make the whole card a link.',
            stage: 'fill',
            height: 420,
          },
        ],
      },
    ],
    a11yNotes: [
      "A card with `href` is a real link, and with `onClick` a real button, so don't put other buttons or links inside those.",
    ],
    propDocs: {
      eyebrow: 'A small line above the title.',
      title: "The card's title.",
      href: 'Makes the card a link.',
      onClick: 'Makes the card a button.',
      sweep:
        'Opts in to the line that runs on hover, at every expression. No card sweeps by default, a link or button card included.',
    },
    related: ['Grid', 'Badge', 'Inset'],
  },
  {
    component: 'Badge',
    summary: 'A small label for a status or a count.',
    use: {
      when: ['Saying what state something is in', 'A count on a button or a heading'],
      instead: [
        { name: 'Tag', why: 'people wrote the label themselves' },
        { name: 'Chip', why: 'pressing it should do something' },
        { name: 'LiveStatus', why: 'it shows a live connection' },
      ],
    },
    playground: {
      example: 'BadgePlay',
      code: '<Badge{props}>{children}</Badge>',
      knobs: [
        { prop: 'children', control: 'text', label: 'Label', initial: 'Live', default: '' },
        {
          prop: 'tone',
          control: 'select',
          options: ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'],
          initial: 'positive',
          default: 'neutral',
        },
        {
          prop: 'emphasis',
          control: 'segmented',
          options: ['soft', 'solid', 'outline'],
          initial: 'soft',
          default: 'soft',
        },
        { prop: 'dot', control: 'switch', initial: true, default: false },
        { prop: 'count', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'BadgeDot', title: 'With a dot', note: '`dot` adds a status dot.' },
          {
            id: 'BadgeTones',
            title: 'Tones',
            note: 'Use `tone` to colour a badge by what it means.',
          },
          { id: 'BadgeEmphasis', title: 'Emphasis', note: '`soft` by default.' },
          {
            id: 'BadgeCount',
            title: 'Counts',
            note: '`count` makes it round. `srText` says what is being counted.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'BadgeProjectList',
            title: 'Status in a list',
            note: "Use `dot` with a `tone` to show each row's status at a glance.",
            stage: 'narrow',
            height: 340,
          },
          {
            id: 'BadgeOnAButton',
            title: 'A count on a button',
            note: 'Use `count` to show a number badge inside a button.',
          },
        ],
      },
    ],
    a11yNotes: [
      'The words carry the status, so it never depends on colour.',
      'A count alone means little to a screen reader: use `srText`.',
    ],
    propDocs: {
      tone: 'What it means.',
      emphasis: '`soft`, `solid` or `outline`.',
      dot: 'A status dot before the label.',
      count: 'Round, for a number.',
      srText: 'Extra words for screen readers, like "unread comments".',
    },
    related: ['Tag', 'Chip', 'LiveStatus'],
  },
  {
    component: 'Tag',
    summary: 'A label people added themselves, which they can often remove.',
    use: {
      when: ['Labels people choose or type', 'A list of values with a remove button'],
      instead: [
        { name: 'Badge', why: 'the app set the status' },
        { name: 'Chip', why: 'it filters when pressed' },
      ],
    },
    playground: {
      example: 'TagPlay',
      code: '<Tag{props} onRemove={remove}>{children}</Tag>',
      knobs: [
        { prop: 'children', control: 'text', label: 'Label', initial: 'frontend', default: '' },
        {
          prop: 'tone',
          control: 'select',
          options: ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'],
          initial: 'neutral',
          default: 'neutral',
        },
        { prop: 'swatch', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'TagPlain', title: 'Plain' },
          { id: 'TagTones', title: 'Tones', note: 'Use `tone` to colour a tag.' },
          {
            id: 'TagSwatches',
            title: 'With a swatch',
            note: '`swatch` adds a dot of colour, for categories.',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'TagRemovable',
            title: 'Removable',
            note: '`onRemove` adds the cross. When the text is an expression, pass `label` to name it.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'TagAddToProject',
            title: 'Adding labels',
            note: 'Use `onRemove` to give each tag a button that takes it off.',
            stage: 'narrow',
            height: 220,
          },
        ],
      },
    ],
    a11yNotes: ['The remove button is named "Remove" plus the tag\'s text.'],
    propDocs: {
      tone: 'Its colour.',
      swatch: 'A dot of colour before the text.',
      onRemove: 'Adds a remove button. You take the tag out of your list.',
      label: 'Names the remove button, when `children` is an expression.',
    },
    related: ['Badge', 'Chip'],
  },
  {
    component: 'Kbd',
    summary: 'One key on the keyboard, drawn as a keycap.',
    use: {
      when: ['Telling people about a keyboard shortcut'],
      instead: [{ name: 'Code', why: 'it is something to type, not a key to press' }],
    },
    playground: {
      example: 'KbdPlay',
      code: '<Kbd>{children}</Kbd>',
      knobs: [{ prop: 'children', control: 'text', label: 'Key', initial: 'Esc', default: '' }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'KbdKeys', title: 'Single keys' },
          { id: 'KbdCombo', title: 'A combination', note: 'One `Kbd` for each key.' },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'KbdInSentence',
            title: 'In a sentence',
            note: 'Wrap each key in `Kbd` to show it as a key inside a sentence.',
            stage: 'narrow',
          },
          {
            id: 'KbdShortcutList',
            title: 'A list of shortcuts',
            note: 'Put one `Kbd` per key in a row to list shortcuts beside what they do.',
            stage: 'narrow',
            height: 240,
          },
        ],
      },
    ],
    a11yNotes: ['It is a real `<kbd>`. For symbols like ⌘, say the name nearby where it matters.'],
    related: ['Tooltip', 'CommandPalette', 'Code'],
  },
  {
    component: 'Ticker',
    summary: 'A number that rolls to its new value, digit by digit.',
    use: {
      when: ['A figure that changes while people watch'],
      instead: [{ name: 'Text', why: 'the number stays the same' }],
    },
    playground: {
      example: 'TickerPlay',
      code: '<Ticker{props} />',
      knobs: [
        // Past 100,000 so en-IN's lakh grouping (12,48,120) visibly differs from en-US (1,248,120).
        {
          prop: 'value',
          control: 'slider',
          min: 0,
          max: 5000000,
          step: 1371,
          initial: 1248120,
          default: 0,
        },
        {
          prop: 'locale',
          control: 'segmented',
          options: ['en-US', 'de-DE', 'en-IN'],
          initial: 'en-US',
          default: '',
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'TickerStep',
            title: 'Rolling',
            note: 'Only digits that change move. A new leading digit arrives on its own.',
          },
          {
            id: 'TickerFormats',
            title: 'Formats',
            note: '`format` takes anything `Intl.NumberFormat` does.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'TickerLiveTraffic',
            title: 'Live figures',
            note: 'Pass a changing `value` to `Ticker` and the figure follows it.',
            stage: 'fill',
            height: 180,
          },
        ],
      },
    ],
    a11yNotes: [
      'The real number is in the page for screen readers, and the digits are hidden from them.',
      'Under reduced motion the number swaps without rolling.',
    ],
    propDocs: {
      value: 'The number.',
      locale: 'Set it so server and browser format the same way.',
    },
    related: ['Text', 'Card', 'Sparkline'],
  },
]
