import type { Doc } from '../types.ts'

export const typographyDocs: Doc[] = [
  {
    component: 'Icon',
    summary: "One icon by name, from warp's set.",
    use: {
      when: ['A picture beside a word, or a label on a button'],
      instead: [{ name: 'Button', why: 'it can be pressed: use its icon prop' }],
    },
    playground: {
      example: 'IconPlay',
      code: '<Icon{props} />',
      knobs: [
        {
          prop: 'name',
          control: 'select',
          options: ['rocket', 'bell', 'star', 'globe', 'server', 'cloud', 'shield', 'settings'],
          initial: 'rocket',
          default: '',
        },
        { prop: 'size', control: 'slider', min: 12, max: 64, step: 2, initial: 32, default: 0 },
        { prop: 'solid', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'IconSizes', title: 'Sizes', note: '`size` is pixels, or any CSS length.' },
          { id: 'IconSolid', title: 'Solid', note: '`solid` is the filled drawing.' },
          {
            id: 'IconAction',
            title: 'Moving',
            note: 'Five icons have a part that moves: `action` runs it on hover, and `action="on"` runs it now.',
          },
          {
            id: 'IconSet',
            title: 'Some of the set',
            note: 'The [icons page](/icons) has them all.',
            stage: 'fill',
            height: 420,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'IconLabelled',
            title: 'With a meaning',
            note: 'Icons are hidden from screen readers. `label` gives one a name.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'IconFeatureList',
            title: 'A feature list',
            note: 'Use `name` and `size` to put an icon beside each line of a list.',
            stage: 'narrow',
            height: 220,
          },
        ],
      },
    ],
    a11yNotes: ['Icons are decorative unless they have a `label`.'],
    propDocs: {
      name: 'Which icon, or an icon imported from `@weft-js/warp-icons`.',
      size: 'Width and height, in pixels or any CSS length.',
      solid: 'The filled drawing.',
      action: 'Runs the moving part: `hover`, `focus`, `press` or `on`.',
      label: 'Names it for screen readers.',
    },
    related: ['Button', 'Chip'],
  },
  {
    component: 'Heading',
    themeScopes: ['text/display', 'text/title', 'text/heading', 'text/label'],
    summary: 'A real heading. Its level sets the page outline, and its size follows.',
    use: {
      when: ['Titling a page or a section'],
      instead: [{ name: 'Text', why: "it looks like a heading but isn't one in the outline" }],
    },
    playground: {
      example: 'HeadingPlay',
      code: '<Heading{props}>{children}</Heading>',
      knobs: [
        {
          prop: 'children',
          control: 'text',
          label: 'Text',
          initial: 'Project settings',
          default: '',
        },
        {
          prop: 'level',
          control: 'segmented',
          options: [1, 2, 3, 4, 5, 6],
          initial: 2,
          default: 2,
        },
        {
          prop: 'role',
          control: 'select',
          options: ['auto', 'display', 'title', 'heading', 'label'],
          initial: 'auto',
          default: 'auto',
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'HeadingLevels',
            title: 'Levels',
            note: 'Each level picks its look, so an `h1` is one size everywhere.',
            stage: 'start',
            height: 240,
          },
          {
            id: 'HeadingRoles',
            title: 'Roles',
            note: '`role` changes the look and leaves the outline alone.',
            stage: 'start',
            height: 260,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'HeadingPageTop',
            title: "A page's outline",
            note: 'Use `level` for the outline, with a single `1` at the top and `2` for each section under it.',
            stage: 'start',
            height: 340,
          },
        ],
      },
    ],
    a11yNotes: ["Don't skip levels: screen reader users move through a page by its headings."],
    propDocs: {
      level: 'The place in the outline, from 1 to 6.',
      role: 'The look: `display`, `title`, `heading` or `label`.',
    },
    related: ['Text', 'Link'],
  },
  {
    component: 'Text',
    summary: "Any text, in one of warp's roles. A size, weight or colour is never a prop.",
    use: {
      when: ["Every piece of text that isn't a heading"],
      instead: [{ name: 'Heading', why: 'it titles a section' }],
    },
    playground: {
      example: 'TextPlay',
      code: '<Text{props}>{children}</Text>',
      knobs: [
        {
          prop: 'children',
          control: 'text',
          label: 'Text',
          initial: 'Deployed two minutes ago',
          default: '',
        },
        {
          prop: 'role',
          control: 'select',
          options: ['body', 'display', 'title', 'heading', 'label', 'caption', 'eyebrow', 'code'],
          initial: 'body',
          default: 'body',
        },
        { prop: 'subtle', control: 'switch', initial: false, default: false },
        { prop: 'faint', control: 'switch', initial: false, default: false },
        {
          prop: 'tone',
          control: 'select',
          options: ['none', 'accent', 'positive', 'caution', 'critical', 'info'],
          initial: 'none',
          default: 'none',
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'TextRoles', title: 'Roles', stage: 'start', height: 360 },
          { id: 'TextInk', title: 'Quieter', note: '`subtle` and `faint`.', stage: 'start' },
          {
            id: 'TextTones',
            title: 'Tones',
            note: '`tone` colours it. Pair it with words, not just colour.',
            stage: 'start',
          },
          {
            id: 'TextInline',
            title: 'Inside a sentence',
            note: '`inline` makes it a span.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'TextDeployNote',
            title: 'Roles working together',
            note: 'Use `role` to pick `eyebrow`, `heading` or `caption` text, and `tone` to colour a line.',
            stage: 'narrow',
            height: 220,
          },
        ],
      },
    ],
    a11yNotes: [
      '`role` here is a look, not an ARIA role: it never reaches the HTML `role` attribute.',
      "Every text colour meets contrast on warp's surfaces, except `faint`, which is for what people can do without.",
    ],
    propDocs: {
      role: 'The look: `display`, `title`, `heading`, `body`, `label`, `caption`, `eyebrow` or `code`.',
      tone: 'Colours it.',
      subtle: 'Quieter.',
      faint: 'Quieter still.',
      inline: 'A `<span>`, not a `<p>`.',
    },
    related: ['Heading', 'Link', 'Code'],
  },
]
