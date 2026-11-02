import type { DocGroup } from '../types.ts'

export const showing: DocGroup = {
  file: 'showing',
  title: 'Showing things',
  intro: 'Laying out what you already have: cards, labels, numbers, type and code.',
  docs: [
    {
      component: 'Card',
      summary: 'A box that groups related things, and can be a link or a button.',
      use: {
        when: ['Grouping one thing\'s details', 'A grid of things to pick from'],
        instead: [{ name: 'Table', why: 'people compare many rows by the same columns' }, { name: 'Inset', why: 'you only want padding, with no surface' }],
      },
      playground: {
        example: 'CardPlay',
        code: '<Card{props}>\n  <Text subtle>Live in eu-west, updated 2 minutes ago.</Text>\n</Card>',
        stage: 'narrow',
        height: 240,
        knobs: [
          { prop: 'eyebrow', control: 'text', initial: 'Project', default: '' },
          { prop: 'title', control: 'text', initial: 'storefront', default: '' },
          { prop: 'sweep', control: 'switch', initial: true, default: true },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'CardStatic', title: 'Static', stage: 'narrow' },
          { id: 'CardAsLink', title: 'A link', note: '`href` makes the whole card a link.', stage: 'narrow' },
          { id: 'CardPress', title: 'A button', note: '`onClick` makes the whole card a button.', stage: 'narrow' },
          { id: 'CardBare', title: 'Bare', note: 'Every part is optional, and `sweep={false}` drops the hover line.', stage: 'narrow' },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'CardStats', title: 'A row of figures', stage: 'fill', height: 180 },
          { id: 'CardProjectGrid', title: 'A grid of projects', stage: 'fill', height: 420 },
        ] },
      ],
      a11yNotes: ['A card with `href` is a real link, and with `onClick` a real button, so don\'t put other buttons or links inside those.'],
      propDocs: {
        eyebrow: 'A small line above the title.',
        title: 'The card\'s title.',
        href: 'Makes the card a link.',
        onClick: 'Makes the card a button.',
        sweep: 'The line that runs on hover.',
      },
      related: ['Grid', 'Badge', 'Inset'],
    },
    {
      component: 'Badge',
      summary: 'A small label for a status or a count.',
      use: {
        when: ['Saying what state something is in', 'A count on a button or a heading'],
        instead: [{ name: 'Tag', why: 'people wrote the label themselves' }, { name: 'Chip', why: 'pressing it should do something' }, { name: 'LiveStatus', why: 'it shows a live connection' }],
      },
      playground: {
        example: 'BadgePlay',
        code: '<Badge{props}>{children}</Badge>',
        knobs: [
          { prop: 'children', control: 'text', label: 'Label', initial: 'Live', default: '' },
          { prop: 'tone', control: 'select', options: ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'], initial: 'positive', default: 'neutral' },
          { prop: 'emphasis', control: 'segmented', options: ['soft', 'solid', 'outline'], initial: 'soft', default: 'soft' },
          { prop: 'dot', control: 'switch', initial: true, default: false },
          { prop: 'count', control: 'switch', initial: false, default: false },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'BadgeDot', title: 'With a dot', note: '`dot` adds a status dot.' },
          { id: 'BadgeTones', title: 'Tones' },
          { id: 'BadgeEmphasis', title: 'Emphasis', note: '`soft` by default.' },
          { id: 'BadgeCount', title: 'Counts', note: '`count` makes it round. `srText` says what is being counted.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'BadgeProjectList', title: 'Status in a list', stage: 'narrow', height: 340 },
          { id: 'BadgeOnAButton', title: 'A count on a button' },
        ] },
      ],
      a11yNotes: ['The words carry the status, so it never depends on colour.', 'A count alone means little to a screen reader: use `srText`.'],
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
        instead: [{ name: 'Badge', why: 'the app set the status' }, { name: 'Chip', why: 'it filters when pressed' }],
      },
      playground: {
        example: 'TagPlay',
        code: '<Tag{props} onRemove={remove}>{children}</Tag>',
        knobs: [
          { prop: 'children', control: 'text', label: 'Label', initial: 'frontend', default: '' },
          { prop: 'tone', control: 'select', options: ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'], initial: 'neutral', default: 'neutral' },
          { prop: 'swatch', control: 'switch', initial: false, default: false },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'TagPlain', title: 'Plain' },
          { id: 'TagTones', title: 'Tones' },
          { id: 'TagSwatches', title: 'With a swatch', note: '`swatch` adds a dot of colour, for categories.' },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'TagRemovable', title: 'Removable', note: '`onRemove` adds the cross. When the text is an expression, pass `label` to name it.' }] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'TagAddToProject', title: 'Adding labels', stage: 'narrow', height: 220 }] },
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
      use: { when: ['Telling people about a keyboard shortcut'], instead: [{ name: 'Code', why: 'it is something to type, not a key to press' }] },
      playground: {
        example: 'KbdPlay',
        code: '<Kbd>{children}</Kbd>',
        knobs: [{ prop: 'children', control: 'text', label: 'Key', initial: 'Esc', default: '' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'KbdKeys', title: 'Single keys' },
          { id: 'KbdCombo', title: 'A combination', note: 'One `Kbd` for each key.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'KbdInSentence', title: 'In a sentence', stage: 'narrow' },
          { id: 'KbdShortcutList', title: 'A list of shortcuts', stage: 'narrow', height: 240 },
        ] },
      ],
      a11yNotes: ['It is a real `<kbd>`. For symbols like ⌘, say the name nearby where it matters.'],
      related: ['Tooltip', 'CommandPalette', 'Code'],
    },
    {
      component: 'Ticker',
      summary: 'A number that rolls to its new value, digit by digit.',
      use: { when: ['A figure that changes while people watch'], instead: [{ name: 'Text', why: 'the number stays the same' }] },
      playground: {
        example: 'TickerPlay',
        code: '<Ticker{props} />',
        knobs: [
          { prop: 'value', control: 'slider', min: 0, max: 100000, step: 137, initial: 48120, default: 0 },
          { prop: 'locale', control: 'segmented', options: ['en-US', 'de-DE', 'en-IN'], initial: 'en-US', default: '' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'TickerStep', title: 'Rolling', note: 'Only digits that change move. A new leading digit arrives on its own.' },
          { id: 'TickerFormats', title: 'Formats', note: '`format` takes anything `Intl.NumberFormat` does.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'TickerLiveTraffic', title: 'Live figures', stage: 'fill', height: 180 }] },
      ],
      a11yNotes: ['The real number is in the page for screen readers, and the digits are hidden from them.', 'Under reduced motion the number swaps without rolling.'],
      propDocs: {
        value: 'The number.',
        locale: 'Set it so server and browser format the same way.',
      },
      related: ['Text', 'Card', 'Sparkline'],
    },
    {
      component: 'Icon',
      summary: 'One icon by name, from warp\'s set.',
      use: {
        when: ['A picture beside a word, or a label on a button'],
        instead: [{ name: 'Button', why: 'it can be pressed: use its icon prop' }],
      },
      playground: {
        example: 'IconPlay',
        code: '<Icon{props} />',
        knobs: [
          { prop: 'name', control: 'select', options: ['rocket', 'bell', 'star', 'globe', 'server', 'cloud', 'shield', 'settings'], initial: 'rocket', default: '' },
          { prop: 'size', control: 'slider', min: 12, max: 64, step: 2, initial: 32, default: 0 },
          { prop: 'solid', control: 'switch', initial: false, default: false },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'IconSizes', title: 'Sizes', note: '`size` is pixels, or any CSS length.' },
          { id: 'IconSolid', title: 'Solid', note: '`solid` is the filled drawing.' },
          { id: 'IconAction', title: 'Moving', note: 'Five icons have a part that moves: `action` runs it on hover, and `action="on"` runs it now.' },
          { id: 'IconSet', title: 'Some of the set', note: 'The [icons page](/icons) has them all.', stage: 'fill', height: 420 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'IconLabelled', title: 'With a meaning', note: 'Icons are hidden from screen readers. `label` gives one a name.' }] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'IconFeatureList', title: 'A feature list', stage: 'narrow', height: 220 }] },
      ],
      a11yNotes: ['Icons are decorative unless they have a `label`.'],
      propDocs: {
        name: 'Which icon, or an icon imported from `@weft/icons`.',
        size: 'Width and height, in pixels or any CSS length.',
        solid: 'The filled drawing.',
        action: 'Runs the moving part: `hover`, `focus`, `press` or `on`.',
        label: 'Names it for screen readers.',
      },
      related: ['Button', 'Chip'],
    },
    {
      component: 'Heading',
      summary: 'A real heading. Its level sets the page outline, and its size follows.',
      use: { when: ['Titling a page or a section'], instead: [{ name: 'Text', why: 'it looks like a heading but isn\'t one in the outline' }] },
      playground: {
        example: 'HeadingPlay',
        code: '<Heading{props}>{children}</Heading>',
        knobs: [
          { prop: 'children', control: 'text', label: 'Text', initial: 'Project settings', default: '' },
          { prop: 'level', control: 'segmented', options: [1, 2, 3, 4, 5, 6], initial: 2, default: 2 },
          { prop: 'role', control: 'select', options: ['auto', 'display', 'title', 'heading', 'label'], initial: 'auto', default: 'auto' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'HeadingLevels', title: 'Levels', note: 'Each level picks its look, so an `h1` is one size everywhere.', stage: 'start', height: 240 },
          { id: 'HeadingRoles', title: 'Roles', note: '`role` changes the look and leaves the outline alone.', stage: 'start', height: 260 },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'HeadingPageTop', title: 'A page\'s outline', stage: 'start', height: 340 }] },
      ],
      a11yNotes: ['Don\'t skip levels: screen reader users move through a page by its headings.'],
      propDocs: { level: 'The place in the outline, from 1 to 6.', role: 'The look: `display`, `title`, `heading` or `label`.' },
      related: ['Text', 'Link'],
    },
    {
      component: 'Text',
      summary: 'Any text, in one of warp\'s roles. A size, weight or colour is never a prop.',
      use: { when: ['Every piece of text that isn\'t a heading'], instead: [{ name: 'Heading', why: 'it titles a section' }] },
      playground: {
        example: 'TextPlay',
        code: '<Text{props}>{children}</Text>',
        knobs: [
          { prop: 'children', control: 'text', label: 'Text', initial: 'Deployed two minutes ago', default: '' },
          { prop: 'role', control: 'select', options: ['body', 'display', 'title', 'heading', 'label', 'caption', 'eyebrow', 'code'], initial: 'body', default: 'body' },
          { prop: 'subtle', control: 'switch', initial: false, default: false },
          { prop: 'faint', control: 'switch', initial: false, default: false },
          { prop: 'tone', control: 'select', options: ['none', 'accent', 'positive', 'caution', 'critical', 'info'], initial: 'none', default: 'none' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'TextRoles', title: 'Roles', stage: 'start', height: 360 },
          { id: 'TextInk', title: 'Quieter', note: '`subtle` and `faint`.', stage: 'start' },
          { id: 'TextTones', title: 'Tones', note: '`tone` colours it. Pair it with words, not just colour.', stage: 'start' },
          { id: 'TextInline', title: 'Inside a sentence', note: '`inline` makes it a span.', stage: 'narrow' },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'TextDeployNote', title: 'Roles working together', stage: 'narrow', height: 220 }] },
      ],
      a11yNotes: ['`role` here is a look, not an ARIA role: it never reaches the HTML `role` attribute.', 'Every text colour meets contrast on warp\'s surfaces, except `faint`, which is for what people can do without.'],
      propDocs: {
        role: 'The look: `display`, `title`, `heading`, `body`, `label`, `caption`, `eyebrow` or `code`.',
        tone: 'Colours it.',
        subtle: 'Quieter.',
        faint: 'Quieter still.',
        inline: 'A `<span>`, not a `<p>`.',
      },
      related: ['Heading', 'Link', 'Code'],
    },
    {
      component: 'Code',
      summary: 'A short piece of code inside a sentence.',
      use: { when: ['Names, flags and commands in running text'], instead: [{ name: 'CodeBlock', why: 'it runs to more than a line' }, { name: 'Snippet', why: 'people will copy it' }] },
      playground: {
        example: 'CodePlay',
        code: '<Code>{children}</Code>',
        stage: 'narrow',
        knobs: [{ prop: 'children', control: 'text', label: 'Code', initial: 'tessel deploy', default: '' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'CodeInSentence', title: 'In a sentence', stage: 'narrow' },
          { id: 'CodeNames', title: 'Names and values' },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'CodeOnACard', title: 'On a card', stage: 'narrow' }] },
      ],
      related: ['CodeBlock', 'Snippet', 'Kbd'],
    },
    {
      component: 'CodeBlock',
      summary: 'A block of coloured code with a copy button.',
      use: { when: ['Several lines of code to read or copy'], instead: [{ name: 'Snippet', why: 'it is one command' }, { name: 'CodeInput', why: 'people will edit it' }] },
      playground: {
        example: 'CodeBlockPlay',
        code: '<CodeBlock code={CONFIG}{props} />',
        stage: 'fill',
        height: 300,
        knobs: [
          { prop: 'filename', control: 'text', initial: 'tessel.config.ts', default: '' },
          { prop: 'language', control: 'select', options: ['tsx', 'ts', 'js', 'json', 'sh'], initial: 'ts', default: 'tsx' },
          { prop: 'lines', control: 'switch', initial: true, default: false },
          { prop: 'wrap', control: 'switch', initial: false, default: false },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'CodeBlockBasic', title: 'Plain', stage: 'fill', height: 260 },
          { id: 'CodeBlockFilename', title: 'With a filename', stage: 'fill', height: 260 },
          { id: 'CodeBlockLines', title: 'With line numbers', stage: 'fill', height: 260 },
          { id: 'CodeBlockWrap', title: 'Wrapping', note: '`wrap` breaks long lines. Without it they scroll.', stage: 'fill', height: 160 },
          { id: 'CodeBlockJson', title: 'Other languages', note: '`tsx`, `ts`, `js`, `json` and `sh` are coloured. Anything else stays plain.', stage: 'fill', height: 320 },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'CodeBlockChooser', title: 'One task, three ways', stage: 'fill', height: 220 }] },
      ],
      keyboard: [['Tab', 'Focuses the code, so arrow keys can scroll it']],
      a11yNotes: ['Long lines scroll, so the block takes focus for keyboard users.', 'It is coloured on the server and needs no script. `copyButtons()` from `@weft/warp-core`, called once, runs every copy button.'],
      related: ['Snippet', 'Code', 'CodeInput', 'Markdown'],
    },
    {
      component: 'Snippet',
      summary: 'One command on one line, with a copy button.',
      use: { when: ['A command or a link for people to copy'], instead: [{ name: 'CodeBlock', why: 'there are several lines' }, { name: 'Code', why: 'it sits in a sentence' }] },
      playground: {
        example: 'SnippetPlay',
        code: '<Snippet{props} />',
        stage: 'narrow',
        knobs: [
          { prop: 'code', control: 'text', initial: 'npm install -g tessel', default: '' },
          { prop: 'prompt', control: 'text', initial: '$', default: '$' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'SnippetInstall', title: 'A command', note: 'The copy button copies the command, not the `$`.', stage: 'narrow' },
          { id: 'SnippetPrompts', title: 'Prompts', note: '`prompt` changes the sign, and an empty one removes it.', stage: 'narrow', height: 220 },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'SnippetGetStarted', title: 'Getting started', stage: 'narrow', height: 300 }] },
      ],
      a11yNotes: ['The prompt is hidden from screen readers.'],
      propDocs: { code: 'What is shown and copied.', prompt: 'The sign before it. Pass `""` for none.' },
      related: ['CodeBlock', 'Code'],
    },
    {
      component: 'Markdown',
      summary: 'Turns Markdown into a styled, safe page of text.',
      use: { when: ['Text people or a server wrote in Markdown'], instead: [{ name: 'MarkdownEditor', why: 'people need to write it too' }, { name: 'Text', why: 'it is your own copy, with no formatting' }] },
      playground: {
        example: 'MarkdownPlay',
        code: '<Markdown source={source} />',
        stage: 'fill',
        height: 240,
        knobs: [{ prop: 'source', control: 'text', initial: 'Previews now **stay up** for 30 days. See the [guide](/docs).', default: '' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'MarkdownNotes', title: 'Headings, lists and quotes', stage: 'fill', height: 360 },
          { id: 'MarkdownTable', title: 'Tables', stage: 'fill', height: 220 },
          { id: 'MarkdownCode', title: 'Code', stage: 'fill', height: 220 },
          { id: 'MarkdownNewTab', title: 'Links in a new tab', note: '`linkTarget="_blank"` for text from outside your app.', stage: 'fill' },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'MarkdownSafe', title: 'Raw HTML', note: 'It is escaped and shows as text, so user content can\'t run a script.', stage: 'fill' }] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'MarkdownComment', title: 'A review comment', stage: 'narrow', height: 260 }] },
      ],
      a11yNotes: ['Start from the right heading level for where it sits, as the source sets the outline.'],
      propDocs: { source: 'The Markdown.', linkTarget: 'Where links open.' },
      related: ['MarkdownEditor', 'CodeBlock', 'Text'],
    },
  ],
}
