import type { Doc } from '../types.ts'

export const buttonDocs: Doc[] = [
  {
    component: 'Button',
    summary: 'Runs an action. Use one main button per screen, and quieter ones around it.',
    hero: 'ButtonDefault',
    use: {
      when: [
        'The press changes something here and now',
        'One main action per view, with quieter ones around it',
      ],
      instead: [
        { name: 'Link', why: 'it goes to another page' },
        { name: 'Toggle', why: 'it stays pressed' },
        { name: 'Menu', why: 'there are several actions and little room' },
      ],
    },
    playground: {
      example: 'ButtonPlay',
      code: '<Button{props}>{children}</Button>',
      knobs: [
        { prop: 'children', control: 'text', label: 'Label', initial: 'Deploy', default: '' },
        { prop: 'emphasis' },
        { prop: 'tone', control: 'select', initial: 'accent', default: 'accent' },
        { prop: 'size', initial: 'md', default: 'md' },
        { prop: 'loading' },
        { prop: 'full' },
        { prop: 'fill', when: { prop: 'emphasis', is: ['frame'] } },
        { prop: 'follow', when: { prop: 'emphasis', is: ['solid', 'soft', 'outline', 'ghost'] } },
      ],
      presets: [
        { label: 'Main action', values: { emphasis: 'solid', tone: 'accent' } },
        {
          label: 'Destructive',
          values: { emphasis: 'solid', tone: 'critical', children: 'Delete project' },
        },
        { label: 'Signature', values: { emphasis: 'frame', fill: true } },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'ButtonEmphasis',
            title: 'Emphasis',
            note: 'Use `emphasis` to set how loud the button is, from `solid` down to `link`.',
          },
          {
            id: 'ButtonTones',
            title: 'Tone',
            note: 'Use `tone` to say what the action means. `critical` is for anything destructive.',
            stage: 'start',
          },
          { id: 'ButtonSizes', title: 'Sizes', note: 'Use `size` for `sm`, `md` or `lg`.' },
          {
            id: 'ButtonFollow',
            title: 'Fill that follows',
            note: 'By default the fill wipes in from the left and out to the right. Add `follow` and, at vivid, it spreads from where the pointer comes in instead.',
          },
          {
            id: 'ButtonWithIcon',
            title: 'With an icon',
            note: 'Use `icon` to draw one before the label.',
          },
          {
            id: 'ButtonIconOnly',
            title: 'Icon only',
            note: 'Needs `label`: it becomes the accessible name.',
          },
          {
            id: 'ButtonFull',
            title: 'Full width',
            note: 'Use `full` to take the width of the container.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'ButtonLoading',
            title: 'Loading',
            note: 'The label stays the accessible name, presses are swallowed and focus stays put.',
          },
          {
            id: 'ButtonDisabled',
            title: 'Disabled',
            note: 'Prefer `aria-disabled`: the button stays focusable, so people can find out why.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ButtonDeleteProject',
            title: 'Delete confirmation',
            note: 'Give the confirming button `tone="critical"` and the way out a quiet `ghost` button.',
            stage: 'narrow',
          },
          {
            id: 'ButtonFormFooter',
            title: 'Form footer',
            note: 'End a form with a `ghost` button to cancel and a main button with `type="submit"`.',
            stage: 'narrow',
          },
          {
            id: 'ButtonEmptyState',
            title: 'Empty state',
            note: 'A single button with an `icon` gives an empty view one clear next step.',
            height: 280,
          },
          {
            id: 'ButtonSaveAsync',
            title: 'Save with progress',
            note: 'Set `loading` while the work runs, then confirm with a toast.',
          },
        ],
      },
    ],
    keyboard: [
      ['Enter', 'Presses the button'],
      ['Space', 'Presses the button'],
    ],
    a11yNotes: [
      'It is a real `<button>`, so it works with every assistive technology and inside forms.',
      'An icon-only button must have `label`.',
    ],
    propDocs: {
      tone: 'What the action means. `critical` for anything destructive.',
      size: '`sm`, `md` or `lg`. Each follows the density around it.',
      full: 'Takes the whole width of its container.',
      icon: 'An icon before the label. Alone, it needs `label`.',
      label: 'The accessible name, for an icon-only button.',
      type: '`button` by default, so a button in a form never submits it by accident.',
      loading: "Shows a spinner, keeps the button's width and swallows presses.",
      follow:
        'At vivid, the hover fill spreads from where the pointer comes in instead of wiping in from the left.',
    },
    related: ['Toggle', 'Menu', 'Chip'],
  },
]
