import type { Doc } from '../../types.ts'
import { fieldProps, sizes, variants } from './shared.ts'

export const formsInput: Doc[] = [
  {
    component: 'Input',
    tile: 'InputClearableCounter',
    summary: 'One line of text: a name, an email, a URL.',
    use: {
      when: ['A short answer people type', 'Any native input type: email, password, url, tel'],
      instead: [
        { name: 'Textarea', why: 'the answer can run over one line' },
        { name: 'Select', why: 'the answer comes from a short list' },
        { name: 'Search', why: 'it filters or finds things' },
      ],
    },
    playground: {
      example: 'InputPlay',
      code: '<Input{props} />',
      stage: 'narrow',
      knobs: [
        { prop: 'label', control: 'text', label: 'Label', initial: 'Project name', default: '' },
        {
          prop: 'hint',
          control: 'text',
          label: 'Hint',
          initial: 'Lowercase letters and dashes.',
          default: '',
        },
        { prop: 'size', control: 'segmented', options: sizes, initial: 'md', default: 'md' },
        {
          prop: 'variant',
          control: 'segmented',
          options: variants,
          initial: 'floating',
          default: 'floating',
        },
        { prop: 'clearable', control: 'switch', initial: true, default: false },
        { prop: 'disabled', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'InputVariants',
            title: 'Label and line styles',
            note: 'The default, `variant="classic"` and `appearance="line"`. Set the default once with `veneer({ fields })`.',
            stage: 'fill',
          },
          {
            id: 'InputSizes',
            title: 'Sizes',
            note: 'Use `size` to pick `sm`, `md` or `lg`.',
            stage: 'narrow',
          },
          {
            id: 'InputTypes',
            title: 'Types and icons',
            note: 'Every native attribute passes through: `type`, `autocomplete`, `inputmode`.',
            stage: 'narrow',
          },
          {
            id: 'InputAffixes',
            title: 'Prefix and suffix',
            note: 'Use `prefix` and `suffix` to show fixed text before and after the value.',
            stage: 'narrow',
          },
          {
            id: 'InputClearableCounter',
            title: 'Clear button and counter',
            note: '`clearable` shows once there is text. `counter` is the most it should hold.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'InputStates',
            title: 'Every state',
            note: 'An input can show a `hint` or an `error`, and can be `disabled` or `readonly`.',
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
            id: 'InputSlug',
            title: 'Live check',
            note: 'Clear the field to see the error.',
            stage: 'narrow',
          },
          {
            id: 'FormProjectSettings',
            title: 'Project settings form',
            note: "Fields share one form, and an input's `error` shows when its value is not valid.",
            stage: 'fill',
            height: 520,
          },
        ],
      },
    ],
    keyboard: [
      ['Tab', 'Moves in and out'],
      ['Esc', 'Clears a `clearable` field'],
    ],
    a11yNotes: [
      'The label is a real `<label>`, and the hint and error are tied to the input with `aria-describedby`.',
      'An error is announced when it appears.',
    ],
    propDocs: {
      type: 'The native input type, such as `email`, `url` or `password`. Text otherwise.',
      ...fieldProps,
      icon: 'An icon before the text.',
      prefix: 'Fixed text before the value, like `https://`.',
      suffix: 'Fixed text after the value, like a unit.',
      clearable: 'A clear button, shown once there is a value.',
      counter: 'The most it should hold. Draws a count under the field.',
    },
    related: ['Field', 'Textarea', 'Search', 'Select'],
  },
  {
    component: 'Textarea',
    tile: 'TextareaCounter',
    summary: 'Several lines of text that grow as people write.',
    use: {
      when: ['Descriptions, notes and messages'],
      instead: [
        { name: 'Input', why: 'one line is enough' },
        { name: 'RichTextEditor', why: 'people need formatting' },
        { name: 'MentionsInput', why: 'people tag each other' },
      ],
    },
    playground: {
      example: 'TextareaPlay',
      code: '<Textarea{props} />',
      stage: 'narrow',
      knobs: [
        { prop: 'label', control: 'text', label: 'Label', initial: 'Description', default: '' },
        {
          prop: 'hint',
          control: 'text',
          label: 'Hint',
          initial: "Shown on the project's card.",
          default: '',
        },
        { prop: 'rows', control: 'slider', min: 2, max: 8, step: 1, initial: 3, default: 3 },
        {
          prop: 'variant',
          control: 'segmented',
          options: variants,
          initial: 'floating',
          default: 'floating',
        },
        { prop: 'disabled', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'TextareaRows',
            title: 'Starting height',
            note: '`rows` is where it starts. It grows to ten lines as people type.',
            stage: 'narrow',
          },
          {
            id: 'TextareaCounter',
            title: 'Counter',
            note: 'Use `counter` to set a character limit and show how much of it is used.',
            stage: 'narrow',
          },
          {
            id: 'TextareaVariants',
            title: 'Label and line styles',
            note: "Use `variant` and `appearance` to change the field's style, here `classic` and `line`.",
            stage: 'fill',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'TextareaStates',
            title: 'Every state',
            note: 'A textarea can show a `hint` or an `error`, and can be `disabled` or `readonly`.',
            stage: 'fill',
            height: 380,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'TextareaReleaseNote',
            title: 'Post a release note',
            note: 'Write something and press ⌘ Enter.',
            stage: 'narrow',
            height: 300,
          },
        ],
      },
    ],
    keyboard: [
      ['Enter', 'A new line'],
      ['⌘ Enter', 'Submits its form'],
    ],
    a11yNotes: ['The same label, hint and error wiring as Input.'],
    propDocs: {
      ...fieldProps,
      rows: 'The starting height in lines.',
      counter: 'The most it should hold. Draws a count under the field.',
    },
    related: ['Input', 'RichTextEditor', 'MentionsInput'],
  },
  {
    component: 'Search',
    tile: 'SearchPlaceholder',
    summary: 'A text field for finding things, with a search icon and a clear button.',
    use: {
      when: ['Filtering a list as people type', 'Finding something across the app'],
      instead: [
        { name: 'Combobox', why: 'people pick one suggestion' },
        { name: 'CommandPalette', why: 'it runs actions' },
      ],
    },
    playground: {
      example: 'SearchPlay',
      code: '<Search{props} />',
      stage: 'narrow',
      knobs: [
        {
          prop: 'label',
          control: 'text',
          label: 'Label',
          initial: 'Search projects',
          default: '',
        },
        {
          prop: 'placeholder',
          control: 'text',
          label: 'Placeholder',
          initial: 'Name, owner or region',
          default: '',
        },
        { prop: 'size', control: 'segmented', options: sizes, initial: 'md', default: 'md' },
        { prop: 'disabled', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'SearchSizes', title: 'Sizes', stage: 'narrow' },
          {
            id: 'SearchPlaceholder',
            title: 'Placeholder',
            note: 'Say what can be searched. The label still names the field.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'SearchStates',
            title: 'Every state',
            note: 'A search field can show a `hint` or an `error`, and can be `disabled` or `readonly`.',
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
            id: 'SearchProjects',
            title: 'Filter a list',
            note: 'Try `jun` or `eu-west`.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
    ],
    keyboard: [
      ['Esc', 'Clears the text'],
      ['Enter', 'Submits its form'],
    ],
    a11yNotes: [
      'The field sits in a `search` landmark, so people can jump straight to it.',
      'Announce the number of results in a live region when the list changes a lot.',
    ],
    propDocs: { ...fieldProps, placeholder: 'What can be searched. Never the only label.' },
    related: ['Input', 'Combobox', 'CommandPalette'],
  },
]
