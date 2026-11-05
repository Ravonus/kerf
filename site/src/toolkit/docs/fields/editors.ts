import type { Doc } from '../../types.ts'
import { shell } from './shared.ts'

export const fieldsEditors: Doc[] = [
  {
    component: 'JsonEditor',
    tile: 'JsonEditorBroken',
    summary: 'A code field for JSON that points to the line with the mistake.',
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'JsonEditorBasic',
            title: 'A config',
            note: 'The hint counts the keys, and Format tidies it.',
            stage: 'fill',
            height: 260,
          },
          {
            id: 'JsonEditorBroken',
            title: 'A parse error',
            note: 'Delete the trailing comma and the error goes.',
            stage: 'fill',
            height: 220,
          },
          {
            id: 'JsonEditorSchema',
            title: 'Your own check',
            note: '`schema` gets the parsed value and returns a message. Change the value to `3`.',
            stage: 'fill',
            height: 260,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'JsonEditorStates',
            title: 'Empty, filled, invalid, disabled and read-only',
            note: 'The line under the field reports on the JSON.',
            stage: 'fill',
            height: 440,
          },
        ],
      },
    ],
    keyboard: [
      ['Tab', 'Indents'],
      ['Esc then Tab', 'Leaves the field'],
    ],
    propDocs: {
      ...shell,
      schema: 'Checks the parsed value. What it returns shows as the error.',
      tabSize: '2 or 4 spaces, used by Format too.',
      rows: 'The height in lines.',
    },
    related: ['CodeInput', 'KeyValueEditor'],
  },
  {
    component: 'KeyValueEditor',
    summary: 'A small table of names and values, like environment variables or headers.',
    use: {
      when: ['Pairs people add and remove by hand'],
      instead: [{ name: 'JsonEditor', why: 'values nest' }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'KeyValueEditorEnv',
            title: 'Environment variables',
            note: 'Add a row, type, remove it. Focus lands somewhere sensible each time.',
            stage: 'fill',
            height: 300,
          },
          {
            id: 'KeyValueEditorJson',
            title: 'Form or JSON',
            note: '`json` adds a switch. Both views edit the same value.',
            stage: 'fill',
            height: 280,
          },
          {
            id: 'KeyValueEditorDuplicate',
            title: 'A repeated key',
            note: 'A warning, not a block: the last one wins.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'KeyValueEditorStates',
            title: 'Empty, filled, hint and invalid',
            note: 'A key value editor can start empty or filled, and can show a `hint` or an `error`.',
            stage: 'fill',
            height: 420,
          },
        ],
      },
    ],
    keyboard: [
      ['Tab', 'Moves from cell to cell'],
      ['Enter', 'On Add row, adds one and moves to it'],
    ],
    propDocs: {
      ...shell,
      value: 'The rows as `{ key, value }`, or a `State` to bind.',
      onValueChange: 'Hears the new rows and why they changed.',
      keyLabel: "The first column's heading.",
      valueLabel: "The second column's heading.",
      json: 'Adds a switch to a JSON view of the same value.',
    },
    related: ['JsonEditor', 'Table'],
  },
  {
    component: 'MentionsInput',
    summary: 'A text box where @ tags people and # links projects.',
    use: {
      when: ['Comments and notes that mention people or things'],
      instead: [{ name: 'RichTextEditor', why: 'people also need formatting' }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'MentionsInputBasic',
            title: 'Two triggers',
            note: 'Each key in `triggers` is a character and its search.',
            stage: 'narrow',
            height: 300,
          },
          {
            id: 'MentionsInputComment',
            title: 'Post a comment',
            note: 'People see names. The value keeps a token, shown here after you post.',
            stage: 'narrow',
            height: 320,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'MentionsInputStates',
            title: 'Every state',
            note: 'A mentions input uses `triggers` to offer people or projects, and can show a `hint` or an `error`.',
            stage: 'fill',
            height: 360,
          },
        ],
      },
    ],
    keyboard: [
      ['↑ ↓', 'Moves through the list'],
      ['Enter Tab', 'Inserts the highlighted one'],
      ['Esc', 'Closes the list'],
    ],
    a11yNotes: [
      'A plain textarea, so paste, autofill and spellcheck still work.',
      'Each insertion is announced.',
    ],
    propDocs: {
      ...shell,
      triggers:
        "A character and its search, like `{ '@': findPeople }`. Superseded searches are aborted.",
      value: 'The text with tokens like `@[Ada](user:ada)`. Can be a `State`.',
      rows: 'The starting height in lines.',
    },
    related: ['Textarea', 'RichTextEditor', 'Combobox'],
  },
  {
    component: 'RichTextEditor',
    tile: 'RichTextEditorLimited',
    summary: 'Formatted text with a toolbar, Markdown shortcuts and / for blocks.',
    use: {
      when: ['Long notes, articles, descriptions with structure'],
      instead: [
        { name: 'MarkdownEditor', why: 'people prefer to see the source' },
        { name: 'Textarea', why: 'plain text will do' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'RichTextEditorBasic',
            title: 'Release notes',
            note: 'Try `/` on an empty line, `@`, or `#` and a space.',
            stage: 'fill',
            height: 300,
          },
          {
            id: 'RichTextEditorBubble',
            title: 'A bubble toolbar',
            note: '`toolbar="bubble"` shows it over a selection.',
            stage: 'narrow',
            height: 200,
          },
          {
            id: 'RichTextEditorLimited',
            title: 'Fewer tools',
            note: '`marks` and `blocks` choose the buttons.',
            stage: 'narrow',
            height: 200,
          },
          {
            id: 'RichTextEditorMarkdown',
            title: 'Store Markdown',
            note: '`format="markdown"` reads and writes Markdown. People still see formatted text.',
            stage: 'fill',
            height: 460,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'RichTextEditorStates',
            title: 'Empty, filled, hint and invalid',
            note: 'A rich text editor can start empty or filled, and can show a `hint` or an `error`.',
            stage: 'fill',
            height: 360,
          },
        ],
      },
    ],
    keyboard: [
      ['⌘ B', 'Bold'],
      ['⌘ I', 'Italic'],
      ['⌘ K', 'Link'],
      ['/', 'Opens the block list on an empty line'],
      ['← →', 'Moves along the toolbar'],
    ],
    a11yNotes: [
      'The toolbar is one Tab stop, with arrow keys inside it.',
      'Everything that enters the editor, a value or a paste, is cleaned first.',
    ],
    propDocs: {
      ...shell,
      format: '`html` or `markdown`, for what `value` holds.',
      toolbar: '`fixed`, `bubble` or `none`. A phone docks it above the keyboard.',
      marks: 'Which inline tools to show.',
      blocks: 'Which block tools to show.',
      commands: 'What `/` offers.',
      mentions: 'Turns on `@`: `{ search }`.',
      placeholder: "Shown while it's empty.",
      minRows: 'The least height in lines.',
      maxRows: 'The most height before it scrolls.',
    },
    related: ['MarkdownEditor', 'MentionsInput', 'Textarea'],
  },
  {
    component: 'MarkdownEditor',
    tile: 'MarkdownEditorShort',
    summary: 'Write Markdown beside a live preview.',
    use: {
      when: ['READMEs, changelogs, docs: people who like seeing the source'],
      instead: [{ name: 'RichTextEditor', why: "people shouldn't need to know Markdown" }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'MarkdownEditorBasic',
            title: 'A README',
            note: "Side by side when there's room, tabs when there isn't.",
            stage: 'fill',
            height: 400,
          },
          {
            id: 'MarkdownEditorShort',
            title: 'A short entry',
            note: 'Use `rows` to set how tall the editor is, here five lines.',
            stage: 'fill',
            height: 240,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'MarkdownEditorStates',
            title: 'Every state',
            note: 'A Markdown editor can show a `hint` or an `error`, and can be `disabled` or `readonly`.',
            stage: 'fill',
            height: 900,
          },
        ],
      },
    ],
    keyboard: [
      ['⌘ B', 'Wraps the selection in bold'],
      ['⌘ I', 'Wraps it in italics'],
      ['⌘ K', 'Wraps it in a link'],
      ['← →', 'Moves between Write and Preview on the tabs'],
    ],
    propDocs: {
      ...shell,
      value: 'The Markdown, or a `State` to bind.',
      rows: 'The height in lines.',
    },
    related: ['RichTextEditor', 'Markdown', 'Textarea'],
  },
  {
    component: 'SignaturePad',
    summary: 'Sign by drawing or by typing a name.',
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'SignaturePadBasic',
            title: 'Draw to sign',
            note: 'Draw with a mouse, a finger or a pen. Undo takes back one stroke.',
            stage: 'narrow',
            height: 340,
          },
          {
            id: 'SignaturePadTyped',
            title: 'Type to sign',
            note: "Always on offer, for people who can't draw.",
            stage: 'narrow',
            height: 320,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'SignaturePadStates',
            title: 'Empty, hint and invalid',
            note: 'A signature pad can be empty, show a `hint`, or show an `error`.',
            stage: 'fill',
            height: 360,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'FormDataAgreement',
            title: 'Sign an agreement',
            note: 'Press the button without signing.',
            stage: 'narrow',
            height: 460,
          },
        ],
      },
    ],
    a11yNotes: [
      'Typing a name is always available, so keyboard and switch users can sign.',
      'The status under the pad is announced.',
    ],
    propDocs: {
      ...shell,
      value: 'The signature with its strokes or text and an SVG, or a `State` to bind.',
      onValueChange: 'Hears the new signature and why it changed.',
    },
    related: ['Input', 'Canvas'],
  },
]
