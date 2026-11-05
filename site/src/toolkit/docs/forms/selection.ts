import type { Doc } from '../../types.ts'
import { fieldProps, sizes, variants } from './shared.ts'

export const formsSelection: Doc[] = [
  {
    component: 'Select',
    summary: 'Pick one value from a list. A menu on a desktop, a sheet on a phone.',
    use: {
      when: [
        "One answer from a list people don't need to compare side by side",
        'Six options or more',
      ],
      instead: [
        { name: 'RadioGroup', why: 'there are few options and they all deserve reading' },
        { name: 'Segmented', why: 'two to four short options switch a view' },
        { name: 'Combobox', why: 'the list is long or comes from a server' },
        { name: 'CompactSelect', why: 'it sits in a table row or a toolbar' },
      ],
    },
    playground: {
      example: 'SelectPlay',
      code: '<Select options={REGIONS}{props} />',
      stage: 'narrow',
      height: 260,
      knobs: [
        { prop: 'label', control: 'text', label: 'Label', initial: 'Region', default: '' },
        {
          prop: 'hint',
          control: 'text',
          label: 'Hint',
          initial: 'Moving a project redeploys it.',
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
        { prop: 'searchable', control: 'switch', initial: false, default: false },
        { prop: 'disabled', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'SelectBasic',
            title: 'A plain list',
            note: 'With no value the first option shows, as a native select does.',
            stage: 'narrow',
            height: 260,
          },
          {
            id: 'SelectPlaceholder',
            title: 'Placeholder',
            note: 'Use `placeholder` when no answer should be assumed.',
            stage: 'narrow',
            height: 280,
          },
          {
            id: 'SelectHints',
            title: 'Options with a hint',
            note: "An option's `hint` is a quieter second line.",
            stage: 'narrow',
            height: 260,
          },
          {
            id: 'SelectGroups',
            title: 'Groups and disabled options',
            note: 'Give `options` a `group` to sort them under headings, and mark one `disabled` to show it without letting it be picked.',
            stage: 'narrow',
            height: 300,
          },
          {
            id: 'SelectSearchable',
            title: 'Search in the list',
            note: '`searchable` adds it. Lists over 15 options get it anyway.',
            stage: 'narrow',
            height: 340,
          },
          {
            id: 'SelectSizes',
            title: 'Sizes',
            note: 'Use `size` to pick `sm`, `md` or `lg`.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'SelectStates',
            title: 'Every state',
            note: 'For a value people can see but not change, show a read-only Input.',
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
            id: 'SelectLinked',
            title: 'Show what was picked',
            note: 'Pass a `State` to `value` and it stays bound.',
            stage: 'narrow',
            height: 340,
          },
          {
            id: 'FormInvite',
            title: 'Invite a teammate',
            note: 'Send one with a bad address, then a good one.',
            stage: 'narrow',
            height: 420,
          },
        ],
      },
    ],
    keyboard: [
      ['Enter Space', 'Opens, or picks the highlighted option'],
      ['↑ ↓', 'Moves through the options'],
      ['Home End', 'Jumps to the first or last'],
      ['Esc', 'Closes and returns focus'],
      ['A letter', 'Jumps to the next option starting with it'],
    ],
    a11yNotes: [
      'The trigger is a button with the `combobox` role, and the list a `listbox`.',
      'A hidden real `<select>` holds the value, so a form posts, resets and validates as usual, and with scripting off that select is what shows.',
    ],
    propDocs: {
      ...fieldProps,
      options:
        'The list: `{ value, label, hint, disabled }`, or `{ group, options }` for a named group.',
      value: 'A string, or a `State` to bind.',
      defaultValue: "The first value, when you don't hold it yourself.",
      onValueChange: 'Hears the new value and why it changed.',
      placeholder: 'A first, empty option.',
      searchable: 'A search box in the list. On by default past 15 options.',
      open: 'Whether the list is open, when you hold that yourself.',
      presentation: 'Force a popover or a sheet. Otherwise it follows the device.',
    },
    related: ['CompactSelect', 'Combobox', 'RadioGroup', 'Segmented'],
  },
  {
    component: 'Checkbox',
    summary: 'A yes or no that takes effect when the form is saved.',
    use: {
      when: ['An option inside a form with a Save button', 'Picking any number from a list'],
      instead: [
        { name: 'Switch', why: 'it applies straight away' },
        { name: 'RadioGroup', why: 'exactly one can be chosen' },
      ],
    },
    playground: {
      example: 'CheckboxPlay',
      code: '<Checkbox{props}>{children}</Checkbox>',
      knobs: [
        {
          prop: 'children',
          control: 'text',
          label: 'Label',
          initial: 'Deploy on push',
          default: '',
        },
        { prop: 'hint', control: 'text', label: 'Hint', initial: '', default: '' },
        { prop: 'checked', control: 'switch', initial: true, default: false },
        { prop: 'indeterminate', control: 'switch', initial: false, default: false },
        { prop: 'disabled', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'CheckboxBasic', title: 'Plain' },
          {
            id: 'CheckboxHint',
            title: 'With a hint',
            note: "A checkbox's `hint` is a quieter second line under its label.",
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'CheckboxStates',
            title: 'Every state',
            note: 'A checkbox can be `checked`, `indeterminate` or `disabled`, and can show a `hint` or an `error`.',
            stage: 'fill',
            height: 200,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CheckboxSelectAll',
            title: 'Select all',
            note: 'The parent shows a dash while only some are on.',
            stage: 'narrow',
            height: 240,
          },
          {
            id: 'CheckboxConfirm',
            title: 'Confirm before deleting',
            note: 'Press Delete without ticking it.',
            stage: 'narrow',
          },
        ],
      },
    ],
    keyboard: [['Space', 'Toggles']],
    a11yNotes: [
      'It is a real checkbox, and the whole label can be pressed.',
      '`indeterminate` sets the real property, so it is announced as mixed.',
    ],
    propDocs: {
      checked: 'Whether it is on. You own this value.',
      indeterminate: 'Shows a dash: some of a set are on.',
      hint: 'A short line under the label.',
      error: 'Replaces the hint and marks it invalid.',
    },
    related: ['Switch', 'RadioGroup', 'Chip'],
  },
  {
    component: 'Radio',
    summary: 'One choice in a set. Give every radio in the set the same name.',
    use: {
      when: ['You need your own layout around each choice'],
      instead: [{ name: 'RadioGroup', why: 'a plain list will do, which is most of the time' }],
    },
    playground: {
      example: 'RadioPlay',
      code: '<Radio{props}>{children}</Radio>',
      knobs: [
        {
          prop: 'children',
          control: 'text',
          label: 'Label',
          initial: 'Replace all at once',
          default: '',
        },
        {
          prop: 'hint',
          control: 'text',
          label: 'Hint',
          initial: 'Fastest, with a moment of downtime.',
          default: '',
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
            id: 'RadioStrategy',
            title: 'A set with hints',
            note: 'The shared `name` is what makes them one set.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'RadioStates',
            title: 'Off, on and disabled',
            note: 'A radio can be `checked`, `disabled`, or both.',
          },
        ],
      },
    ],
    keyboard: [
      ['↑ ↓', 'Moves to the next choice and picks it'],
      ['Tab', 'Moves in and out of the set'],
    ],
    a11yNotes: [
      'These are real radios, so arrow keys and form values work as usual.',
      'Wrap a hand-built set in an element with `role="radiogroup"` and a name.',
    ],
    propDocs: {
      hint: 'A short line under the label.',
      name: 'Shared by every radio in the set.',
      checked: 'Whether this one is picked.',
    },
    related: ['RadioGroup', 'Checkbox', 'Segmented'],
  },
]
