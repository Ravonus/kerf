import type { Doc } from '../../types.ts'

export const formsChoices: Doc[] = [
  {
    component: 'RadioGroup',
    summary: 'Pick exactly one from a short list where every option is on show.',
    use: {
      when: ['Two to five options people should read and compare'],
      instead: [
        { name: 'Select', why: 'there are many options' },
        { name: 'Segmented', why: 'the options are one or two words and switch a view' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'RadioGroupWindow',
            title: 'Hints and a disabled option',
            note: "An option's `hint` sits under its label, and `disabled` keeps it on show but out of reach.",
            stage: 'narrow',
          },
          {
            id: 'RadioGroupPlain',
            title: 'Labels only',
            note: 'Leave out `hint` when the label says enough.',
            stage: 'narrow',
          },
          {
            id: 'RadioGroupRich',
            title: 'More than words',
            note: "A `label` can be any content, like a badge with each region's latency.",
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'RadioGroupPlan',
            title: 'Choose a plan',
            note: 'Plan and seats both change the total.',
            stage: 'narrow',
            height: 300,
          },
          {
            id: 'RadioGroupForm',
            title: 'In a form',
            note: "`name` is what the choice posts under. Save reads it back from the form's data.",
            stage: 'narrow',
            height: 300,
          },
        ],
      },
    ],
    keyboard: [
      ['↑ ↓', 'Moves to the next choice and picks it'],
      ['Tab', 'Moves in and out of the group'],
    ],
    a11yNotes: [
      "`label` names the group for screen readers, but isn't drawn. Put a heading above it when people need one too.",
    ],
    propDocs: {
      label: "The group's accessible name.",
      value: 'The value that is picked.',
      onChange: 'Called with the new value.',
      options: 'The choices: `{ value, label, hint, disabled }`.',
      name: 'The form field name. Made up for you when left out.',
    },
    related: ['Radio', 'Select', 'Segmented'],
  },
  {
    component: 'Switch',
    summary: 'Turns a setting on or off straight away, with no Save button.',
    use: {
      when: ["A setting that applies the moment it's flipped"],
      instead: [
        { name: 'Checkbox', why: 'it waits for a Save button' },
        { name: 'Toggle', why: "it's a tool in a toolbar" },
      ],
    },
    playground: {
      example: 'SwitchPlay',
      code: '<Switch{props}>{children}</Switch>',
      knobs: [
        {
          prop: 'children',
          control: 'text',
          label: 'Label',
          initial: 'Preview deploys',
          default: '',
        },
        { prop: 'hint', control: 'text', label: 'Hint', initial: '', default: '' },
        { prop: 'checked', control: 'switch', initial: true, default: false },
        {
          prop: 'size',
          control: 'segmented',
          options: ['sm', 'md'],
          initial: 'md',
          default: 'md',
        },
        {
          prop: 'placement',
          control: 'segmented',
          options: ['end', 'start'],
          initial: 'end',
          default: 'end',
        },
        { prop: 'disabled', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'SwitchBasic', title: 'Plain' },
          {
            id: 'SwitchSizes',
            title: 'Sizes',
            note: 'Use `size` to pick `sm` or `md`.',
            stage: 'narrow',
          },
          {
            id: 'SwitchPlacement',
            title: 'Placement',
            note: '`placement` picks the side the switch sits on.',
            stage: 'narrow',
          },
          {
            id: 'SwitchHint',
            title: 'With a hint',
            note: "A switch's `hint` is a quieter second line under its label.",
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'SwitchStates',
            title: 'Every state',
            note: 'A switch can be on or off, show a `hint`, or be `disabled` either way.',
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
            id: 'SwitchSettings',
            title: 'Settings that apply at once',
            note: 'Each flip takes effect and says so.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
    ],
    keyboard: [['Space', 'Toggles']],
    a11yNotes: [
      'A real checkbox with the `switch` role, so it reads as on or off.',
      "Keep the label the same in both states. Say what it controls, not what it's doing.",
    ],
    propDocs: {
      checked: 'Whether it is on. You own this value.',
      hint: 'A short line under the label.',
      size: '`sm` or `md`.',
      placement: 'Which side of the label the switch sits on.',
    },
    related: ['Checkbox', 'Toggle'],
  },
  {
    component: 'Slider',
    summary: 'Pick a number or a range by dragging, when about right is good enough.',
    use: {
      when: ['A value in a known range where the feel matters more than the digit'],
      instead: [
        { name: 'NumberField', why: 'people need an exact number' },
        { name: 'Segmented', why: 'there are only a few fixed steps' },
      ],
    },
    playground: {
      example: 'SliderPlay',
      code: '<Slider value={v.value} onChange={next => (v.value = next)}{props} />',
      stage: 'narrow',
      knobs: [
        { prop: 'label', control: 'text', label: 'Label', initial: 'Copies', default: '' },
        { prop: 'min', control: 'slider', min: 0, max: 4, step: 1, initial: 1, default: 0 },
        { prop: 'max', control: 'slider', min: 8, max: 100, step: 4, initial: 12, default: 100 },
        { prop: 'step', control: 'slider', min: 1, max: 4, step: 1, initial: 1, default: 1 },
        { prop: 'disabled', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'SliderBasic', title: 'One value', stage: 'narrow' },
          {
            id: 'SliderFormat',
            title: 'Formatted value',
            note: '`format` draws the number with its unit.',
            stage: 'narrow',
          },
          {
            id: 'SliderStep',
            title: 'Steps',
            note: 'Use `step` to snap the value to fixed jumps, here every 25.',
            stage: 'narrow',
          },
          {
            id: 'SliderRange',
            title: 'A range',
            note: 'Two numbers make two thumbs. `names` tells screen readers which is which.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'SliderDisabled',
            title: 'Disabled',
            note: 'Use `disabled` to show a value that cannot be changed.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SliderAutoscale',
            title: 'Autoscale limits',
            note: 'Pass a pair of numbers as `value` for a range with a low and a high end, and `names` to label each end.',
            stage: 'narrow',
          },
        ],
      },
    ],
    keyboard: [
      ['← →', 'One step down or up'],
      ['Page Up Page Down', 'A bigger step'],
      ['Home End', 'The minimum or maximum'],
    ],
    a11yNotes: [
      'Each thumb has the `slider` role and is named by the label.',
      "People who can't drag can tap the track or use the keys.",
    ],
    propDocs: {
      value: 'One number, or two for a range.',
      onChange: 'Called with the new number or pair.',
      format: 'Turns the number into the text shown and read out.',
      names: 'What each thumb of a range means, for screen readers.',
      name: 'Posts with a form: one entry per thumb.',
    },
    related: ['NumberField', 'Segmented'],
  },
]
