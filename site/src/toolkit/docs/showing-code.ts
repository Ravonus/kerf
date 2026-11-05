import type { Doc } from '../types.ts'

export const codeDocs: Doc[] = [
  {
    component: 'Code',
    summary: 'A short piece of code inside a sentence.',
    use: {
      when: ['Names, flags and commands in running text'],
      instead: [
        { name: 'CodeBlock', why: 'it runs to more than a line' },
        { name: 'Snippet', why: 'people will copy it' },
      ],
    },
    playground: {
      example: 'CodePlay',
      code: '<Code>{children}</Code>',
      stage: 'narrow',
      knobs: [
        { prop: 'children', control: 'text', label: 'Code', initial: 'weft deploy', default: '' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'CodeInSentence', title: 'In a sentence', stage: 'narrow' },
          {
            id: 'CodeNames',
            title: 'Names and values',
            note: 'Use `Code` to mark a name or value inside a sentence.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CodeOnACard',
            title: 'On a card',
            note: 'A `Code` can sit inline in a sentence, here on a card, to mark a commit, a branch and a region.',
            stage: 'narrow',
          },
        ],
      },
    ],
    related: ['CodeBlock', 'Snippet', 'Kbd'],
  },
  {
    component: 'CodeBlock',
    summary: 'A block of coloured code with a copy button.',
    use: {
      when: ['Several lines of code to read or copy'],
      instead: [
        { name: 'Snippet', why: 'it is one command' },
        { name: 'CodeInput', why: 'people will edit it' },
      ],
    },
    playground: {
      example: 'CodeBlockPlay',
      code: '<CodeBlock code={CONFIG}{props} />',
      stage: 'fill',
      height: 300,
      knobs: [
        { prop: 'filename', control: 'text', initial: 'weft.config.ts', default: '' },
        {
          prop: 'language',
          control: 'select',
          options: ['tsx', 'ts', 'js', 'json', 'sh'],
          initial: 'ts',
          default: 'tsx',
        },
        { prop: 'lines', control: 'switch', initial: true, default: false },
        { prop: 'wrap', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'CodeBlockBasic', title: 'Plain', stage: 'fill', height: 260 },
          {
            id: 'CodeBlockFilename',
            title: 'With a filename',
            note: "Use `filename` to show the file's name above the code.",
            stage: 'fill',
            height: 260,
          },
          {
            id: 'CodeBlockLines',
            title: 'With line numbers',
            note: 'Use `lines` to number each line.',
            stage: 'fill',
            height: 260,
          },
          {
            id: 'CodeBlockWrap',
            title: 'Wrapping',
            note: '`wrap` breaks long lines. Without it they scroll.',
            stage: 'fill',
            height: 160,
          },
          {
            id: 'CodeBlockJson',
            title: 'Other languages',
            note: '`tsx`, `ts`, `js`, `json` and `sh` are coloured. Anything else stays plain.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CodeBlockChooser',
            title: 'One task, three ways',
            note: 'Pair a `Segmented` control with `CodeBlock` to let people pick which version of the code to read.',
            stage: 'fill',
            height: 220,
          },
        ],
      },
    ],
    keyboard: [['Tab', 'Focuses the code, so arrow keys can scroll it']],
    a11yNotes: [
      'Long lines scroll, so the block takes focus for keyboard users.',
      'It is coloured on the server and needs no script. `copyButtons()` from `@weft-js/warp-core`, called once, runs every copy button.',
    ],
    related: ['Snippet', 'Code', 'CodeInput', 'Markdown'],
  },
  {
    component: 'Snippet',
    summary: 'One command on one line, with a copy button.',
    use: {
      when: ['A command or a link for people to copy'],
      instead: [
        { name: 'CodeBlock', why: 'there are several lines' },
        { name: 'Code', why: 'it sits in a sentence' },
      ],
    },
    playground: {
      example: 'SnippetPlay',
      code: '<Snippet{props} />',
      stage: 'narrow',
      knobs: [
        { prop: 'code', control: 'text', initial: 'npm install -g weft', default: '' },
        { prop: 'prompt', control: 'text', initial: '$', default: '$' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'SnippetInstall',
            title: 'A command',
            note: 'The copy button copies the command, not the `$`.',
            stage: 'narrow',
          },
          {
            id: 'SnippetPrompts',
            title: 'Prompts',
            note: '`prompt` changes the sign, and an empty one removes it.',
            stage: 'narrow',
            height: 220,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SnippetGetStarted',
            title: 'Getting started',
            note: 'Use `code` for a one-line command, one for each step.',
            stage: 'narrow',
            height: 300,
          },
        ],
      },
    ],
    a11yNotes: ['The prompt is hidden from screen readers.'],
    propDocs: {
      code: 'What is shown and copied.',
      prompt: 'The sign before it. Pass `""` for none.',
    },
    related: ['CodeBlock', 'Code'],
  },
  {
    component: 'Markdown',
    summary: 'Turns Markdown into a styled, safe page of text.',
    use: {
      when: ['Text people or a server wrote in Markdown'],
      instead: [
        { name: 'MarkdownEditor', why: 'people need to write it too' },
        { name: 'Text', why: 'it is your own copy, with no formatting' },
      ],
    },
    playground: {
      example: 'MarkdownPlay',
      code: '<Markdown source={source} />',
      stage: 'fill',
      height: 240,
      knobs: [
        {
          prop: 'source',
          control: 'text',
          initial: 'Previews now **stay up** for 30 days. See the [guide](/docs).',
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
            id: 'MarkdownNotes',
            title: 'Headings, lists and quotes',
            stage: 'fill',
            height: 360,
          },
          {
            id: 'MarkdownTable',
            title: 'Tables',
            note: 'Use `source` with a Markdown table to show rows and columns.',
            stage: 'fill',
            height: 220,
          },
          {
            id: 'MarkdownCode',
            title: 'Code',
            note: 'Use `source` with a fenced block to show code inside Markdown text.',
            stage: 'fill',
            height: 220,
          },
          {
            id: 'MarkdownNewTab',
            title: 'Links in a new tab',
            note: '`linkTarget="_blank"` for text from outside your app.',
            stage: 'fill',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'MarkdownSafe',
            title: 'Raw HTML',
            note: "It is escaped and shows as text, so user content can't run a script.",
            stage: 'fill',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'MarkdownComment',
            title: 'A review comment',
            note: 'Use `source` to render a comment as formatted text inside a card.',
            stage: 'narrow',
            height: 260,
          },
        ],
      },
    ],
    a11yNotes: [
      'Start from the right heading level for where it sits, as the source sets the outline.',
    ],
    propDocs: { source: 'The Markdown.', linkTarget: 'Where links open.' },
    related: ['MarkdownEditor', 'CodeBlock', 'Text'],
  },
]
