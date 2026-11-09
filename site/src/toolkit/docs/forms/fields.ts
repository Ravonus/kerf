import type { Doc } from '../../types.ts'
import { fieldProps, variants } from './shared.ts'

export const formsFields: Doc[] = [
  {
    component: 'Segmented',
    summary: 'A row of two to five short options where exactly one is on.',
    use: {
      when: ['Switching a view or a period', 'Options of a word or two'],
      instead: [
        { name: 'Tabs', why: 'each option has its own panel of content' },
        { name: 'RadioGroup', why: 'the options need a sentence each' },
        { name: 'Chip', why: 'several can be on' },
      ],
    },
    playground: {
      example: 'SegmentedPlay',
      code: '<Segmented value={v.value} options={PERIODS} onChange={next => (v.value = next)}{props} />',
      knobs: [
        { prop: 'label', control: 'text', label: 'Label', initial: 'Period', default: '' },
        {
          prop: 'size',
          control: 'segmented',
          options: ['sm', 'md'],
          initial: 'md',
          default: 'md',
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'SegmentedBasic', title: 'Plain' },
          {
            id: 'SegmentedIcons',
            title: 'With icons',
            note: 'Give an option an `icon` to draw it beside its label.',
          },
          { id: 'SegmentedSizes', title: 'Sizes', note: 'Use `size` to pick `sm` or `md`.' },
          {
            id: 'SegmentedDisabledOption',
            title: 'A disabled option',
            note: 'Mark an option `disabled` to show it without letting it be picked.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SegmentedDeploys',
            title: 'Filter with counts',
            note: "An option's `count` shows how many match.",
            stage: 'narrow',
            height: 240,
          },
        ],
      },
    ],
    keyboard: [
      ['← →', 'Moves to the next option and picks it'],
      ['Tab', 'Moves in and out'],
    ],
    a11yNotes: [
      "Native radios in a `radiogroup`, so `label` names the group even though it isn't drawn.",
    ],
    propDocs: {
      label: "The group's accessible name. Not drawn.",
      value: 'The value that is on.',
      onChange: 'Called with the new value.',
      options: 'The options: `{ value, label, icon, count, disabled }`.',
      size: '`sm` or `md`.',
      name: 'The form field name. Made up for you when left out.',
    },
    related: ['Tabs', 'RadioGroup', 'Toggle', 'Chip'],
  },
  {
    component: 'Field',
    summary: 'The frame every field shares: label, icon, hint, error. Wrap your own control in it.',
    use: {
      when: ["A control Warp doesn't have that should sit with the rest of a form"],
      instead: [
        { name: 'Input', why: "it's plain text" },
        { name: 'Select', why: "it's a list" },
      ],
    },
    playground: {
      example: 'FieldPlay',
      code: '<Input{props} />',
      stage: 'narrow',
      knobs: [
        { prop: 'label', control: 'text', label: 'Label', initial: 'Domain', default: '' },
        {
          prop: 'hint',
          control: 'text',
          label: 'Hint',
          initial: 'You can add your own later.',
          default: '',
        },
        { prop: 'error', control: 'text', label: 'Error', initial: '', default: '' },
        { prop: 'prefix', control: 'text', label: 'Prefix', initial: 'https://', default: '' },
        { prop: 'suffix', control: 'text', label: 'Suffix', initial: '.weft.dev', default: '' },
        {
          prop: 'variant',
          control: 'segmented',
          options: variants,
          initial: 'floating',
          default: 'floating',
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'FieldAnatomy',
            title: 'Every part',
            note: 'Icon, prefix, suffix, clear button, hint and counter. Input, Select and the rich fields all pass these on.',
            stage: 'narrow',
          },
          {
            id: 'FieldLabelStyles',
            title: 'Label styles',
            note: 'Use `variant` to put the label on the border, which is the default, or `classic` to put it above the field.',
            stage: 'fill',
          },
          {
            id: 'FieldError',
            title: 'Hint and error',
            note: "An error takes the hint's place, so the layout doesn't jump.",
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'FieldCustomControl',
            title: 'An action on the edge',
            note: '`Input` takes every `Field` prop, so `end` adds to the right edge.',
            stage: 'narrow',
          },
          {
            id: 'FieldForm',
            title: 'A short form',
            note: 'Fields stack into a form, and `autocomplete` lets the browser fill in the name and email.',
            stage: 'narrow',
          },
        ],
      },
    ],
    a11yNotes: [
      'Use the `id` and `describedby` that `control` receives, so the label, hint and error stay tied to your control.',
    ],
    propDocs: {
      ...fieldProps,
      control: 'Draws the control. Gets `id`, `describedby`, `invalid` and the remaining props.',
      end: 'Sits at the right edge of the frame, after any suffix.',
      filled: "Keeps the label up when your control holds a value the field can't see.",
      icon: 'An icon before the control.',
      prefix: 'Fixed text before the value.',
      suffix: 'Fixed text after the value.',
      clearable: 'A clear button, shown once there is a value.',
      counter: 'The most it should hold. Draws a count under the field.',
    },
    hideProps: ['attrs', 'group', 'labelled', 'hold', 'wrap', 'reset'],
    related: ['Input', 'Select', 'Textarea'],
  },
  {
    component: 'CompactSelect',
    summary: 'A small Select with no floating label, for table rows, pagers and toolbars.',
    use: {
      when: ['A choice inside a row or a toolbar, repeated many times'],
      instead: [
        { name: 'Select', why: "it's a field in a form" },
        { name: 'Menu', why: 'it runs an action rather than holding a value' },
      ],
    },
    playground: {
      example: 'CompactSelectPlay',
      code: '<CompactSelect options={REGIONS}{props} />',
      height: 260,
      knobs: [
        { prop: 'label', control: 'text', label: 'Label', initial: 'Region', default: '' },
        { prop: 'placeholder', control: 'text', label: 'Placeholder', initial: '', default: '' },
        { prop: 'disabled', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'CompactSelectBasic',
            title: 'Plain',
            note: "`label` is the accessible name. It isn't drawn.",
            height: 260,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'CompactSelectStates',
            title: 'Empty, filled and disabled',
            note: 'A compact select can show a `placeholder` when empty, hold a chosen value, or be `disabled`.',
            height: 260,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CompactSelectRows',
            title: 'Rows per page',
            note: 'A compact select suits a small choice beside other content, here the number of rows per page.',
            stage: 'narrow',
            height: 320,
          },
          {
            id: 'CompactSelectRoles',
            title: 'A role in each row',
            note: "Give each row its own compact select, with `defaultValue` set to the person's current role.",
            stage: 'narrow',
            height: 340,
          },
        ],
      },
    ],
    keyboard: [
      ['Enter Space', 'Opens, or picks the highlighted option'],
      ['↑ ↓', 'Moves through the options'],
      ['Esc', 'Closes and returns focus'],
    ],
    a11yNotes: [
      'With nothing drawn for `label`, make it specific: "Role for Jun Tanaka", not "Role".',
    ],
    propDocs: {
      label: 'The accessible name. Not drawn.',
      options: 'The list, the same as Select.',
      value: 'A string, or a `State` to bind.',
      name: 'Puts it in a form with a hidden input.',
      describedby: 'The id of text that explains it.',
    },
    related: ['Select', 'Pagination', 'Table'],
  },
  {
    component: 'NumberField',
    summary: 'A number you can type or step, with arrow keys and two buttons.',
    use: {
      when: ['An exact number, like seats or a retry count'],
      instead: [{ name: 'Slider', why: 'a rough value is enough' }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'NumberFieldBasic',
            title: 'Bounds',
            note: '`min`, `max` and `step` limit the steppers and the arrow keys.',
            stage: 'narrow',
          },
          {
            id: 'NumberFieldDecimal',
            title: 'Fractions and a unit',
            note: 'A fractional `step` moves by that much. `suffix` names the unit.',
            stage: 'narrow',
          },
          {
            id: 'NumberFieldMoney',
            title: 'Money',
            note: '`prefix` shows the currency. Page Up and Page Down move ten steps at a time.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'sizes',
        title: 'Sizes',
        examples: [
          {
            id: 'NumberFieldSizes',
            title: 'Small, medium and large',
            note: '`size` matches the other fields in a form.',
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
            id: 'NumberFieldStates',
            title: 'Hint, error, read-only, disabled',
            note: 'Read-only and disabled turn the steppers off too.',
            stage: 'fill',
            height: 300,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'NumberFieldSeats',
            title: 'Buying seats',
            note: 'Use `min` and `max` to limit the count, and read `value` to work out a total.',
            stage: 'narrow',
          },
        ],
      },
    ],
    keyboard: [
      ['↑ ↓', 'Steps up or down'],
      ['PageUp PageDown', 'Steps by ten'],
      ['Home End', 'Jumps to the bound, when there is one'],
    ],
    propDocs: {
      step: 'How far one press moves it.',
      min: 'The lowest it can step to.',
      max: 'The highest it can step to.',
    },
    related: ['Input', 'Slider'],
  },
]
