import type { DocGroup } from '../types.ts'

export const actions: DocGroup = {
  file: 'actions',
  title: 'Actions',
  intro: 'Things people press to make something happen.',
  docs: [
    {
      component: 'Button',
      summary: 'Runs an action. Use one main button per screen, and quieter ones around it.',
      use: {
        when: ['The press changes something here and now', 'One main action per view, with quieter ones around it'],
        instead: [{ name: 'Link', why: 'it goes to another page' }, { name: 'Toggle', why: 'it stays pressed' }, { name: 'Menu', why: 'there are several actions and little room' }],
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
        ],
        presets: [
          { label: 'Main action', values: { emphasis: 'solid', tone: 'accent' } },
          { label: 'Destructive', values: { emphasis: 'solid', tone: 'critical', children: 'Delete project' } },
          { label: 'Signature', values: { emphasis: 'frame', fill: true } },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'ButtonEmphasis', title: 'Emphasis', note: 'Six levels of `emphasis`, loudest first. Fixed when the button is made.' },
          { id: 'ButtonTones', title: 'Tone', note: 'Each `tone` against the `emphasis` levels that show colour.', stage: 'start' },
          { id: 'ButtonSizes', title: 'Sizes' },
          { id: 'ButtonWithIcon', title: 'With an icon' },
          { id: 'ButtonIconOnly', title: 'Icon only', note: 'Needs `label`: it becomes the accessible name.' },
          { id: 'ButtonFull', title: 'Full width', stage: 'narrow' },
        ] },
        { kind: 'states', title: 'States', examples: [
          { id: 'ButtonLoading', title: 'Loading', note: 'The label stays the accessible name, presses are swallowed and focus stays put.' },
          { id: 'ButtonDisabled', title: 'Disabled', note: 'Prefer `aria-disabled`: the button stays focusable, so people can find out why.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'ButtonDeleteProject', title: 'Delete confirmation', stage: 'narrow' },
          { id: 'ButtonFormFooter', title: 'Form footer', stage: 'narrow' },
          { id: 'ButtonEmptyState', title: 'Empty state', height: 280 },
          { id: 'ButtonSaveAsync', title: 'Save with progress' },
        ] },
      ],
      keyboard: [['Enter', 'Presses the button'], ['Space', 'Presses the button']],
      a11yNotes: ['It is a real `<button>`, so it works with every assistive technology and inside forms.', 'An icon-only button must have `label`.'],
      propDocs: {
        tone: 'What the action means. `critical` for anything destructive.',
        size: '`sm`, `md` or `lg`. Each follows the density around it.',
        full: 'Takes the whole width of its container.',
        icon: 'An icon before the label. Alone, it needs `label`.',
        label: 'The accessible name, for an icon-only button.',
        type: '`button` by default, so a button in a form never submits it by accident.',
        loading: 'Shows a spinner, keeps the button\'s width and swallows presses.',
      },
      related: ['Toggle', 'Menu', 'Chip'],
    },
    {
      component: 'Toggle',
      summary: 'A button that stays pressed, like Bold in an editor.',
      use: {
        when: ['One setting that is on or off and acts straight away', 'A row of independent formatting options'],
        instead: [{ name: 'Switch', why: 'it is a setting in a form or a list' }, { name: 'Segmented', why: 'exactly one of several is on' }],
      },
      playground: {
        example: 'TogglePlay',
        code: '<Toggle{props}>{children}</Toggle>',
        knobs: [
          { prop: 'children', control: 'text', label: 'Label', initial: 'Bold', default: '' },
          { prop: 'pressed', control: 'switch', initial: true, default: false },
          { prop: 'size', initial: 'md', default: 'md' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'ToggleToolbar', title: 'Formatting toolbar', note: 'Each one is independent, so any number can be on.' },
          { id: 'ToggleSizes', title: 'Sizes' },
          { id: 'ToggleIconOnly', title: 'Icon only', note: 'Pass `label` for the accessible name.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'ToggleWatch', title: 'Watch a project', stage: 'narrow' }] },
      ],
      keyboard: [['Enter', 'Toggles'], ['Space', 'Toggles']],
      a11yNotes: ['`pressed` sets `aria-pressed`, so the state is announced. Keep the label the same in both states.'],
      propDocs: { pressed: 'Whether it is on. You own this value.' },
      related: ['Button', 'Switch', 'Chip'],
    },
    {
      component: 'Chip',
      summary: 'A small on or off filter, often with a count.',
      use: { when: ['Filtering a list by several values at once'], instead: [{ name: 'Tag', why: 'it only labels something' }, { name: 'Segmented', why: 'exactly one is on' }] },
      playground: {
        example: 'ChipPlay',
        code: '<Chip{props}>{children}</Chip>',
        knobs: [
          { prop: 'children', control: 'text', label: 'Label', initial: 'Failed', default: '' },
          { prop: 'pressed', initial: true, default: false },
          { prop: 'count', control: 'slider', min: 0, max: 40, step: 1, initial: 4, default: -1 },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'ChipFilters', title: 'Filters with counts', note: 'A pressed chip draws its check. `count` is optional.' },
          { id: 'ChipIcons', title: 'With an icon' },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'ChipFilterList', title: 'Filtering a list', stage: 'narrow', height: 300 }] },
      ],
      keyboard: [['Enter', 'Toggles'], ['Space', 'Toggles']],
      propDocs: { pressed: 'Whether the filter is on.', count: 'A number after the label, usually the matches.' },
      related: ['Toggle', 'Tag', 'Segmented'],
    },
    {
      component: 'Menu',
      summary: 'A short list of actions that opens from a button.',
      use: { when: ['Several actions on one thing, and not much room'], instead: [{ name: 'Select', why: 'people are choosing a value' }, { name: 'CommandPalette', why: 'there are hundreds of commands' }] },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'MenuBasic', title: 'Actions', note: 'Icons, `shortcut` hints, a separator, and `tone` for the destructive one.', height: 220 },
          { id: 'MenuGroups', title: 'Groups', note: 'A `group` entry names what follows.', height: 220 },
          { id: 'MenuTrigger', title: 'Trigger styles', note: '`trigger` takes any Button prop.', height: 220 },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'MenuRowActions', title: 'A row\'s actions', stage: 'narrow', height: 220 }] },
      ],
      keyboard: [['Enter', 'Opens, or picks the highlighted item'], ['↑ ↓', 'Moves through the items'], ['Home End', 'Jumps to the first or last'], ['Esc', 'Closes and returns focus'], ['A letter', 'Jumps to the next item starting with it']],
      propDocs: { label: 'The trigger\'s text.', items: 'The entries: an action, `{ separator: true }` or `{ group }`.', trigger: 'Button props for the trigger.', side: 'Which side it opens on.', align: 'How it lines up with the trigger.' },
      related: ['Button', 'Popover', 'CommandPalette'],
    },
    {
      component: 'CommandPalette',
      summary: 'Find any action by typing its name.',
      use: { when: ['An app with more commands than fit on screen', 'People who prefer the keyboard'], instead: [{ name: 'Menu', why: 'there are only a few actions' }] },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'CommandPaletteBasic', title: 'Commands in groups', note: 'Bind `open` to any button; `hotkey` opens it from anywhere.' },
          { id: 'CommandPaletteRun', title: 'Running a command', note: '`onRun` gets the command that was picked.' },
        ] },
      ],
      keyboard: [['⌘ K', 'Opens it from anywhere'], ['↑ ↓', 'Moves through the results'], ['Enter', 'Runs the highlighted command'], ['Esc', 'Closes and returns focus']],
      propDocs: { commands: 'What can be found: label, group, icon, shortcut.', hotkey: 'The letter that opens it with ⌘ or Ctrl.', onRun: 'Called with the command that was picked.' },
      related: ['Menu', 'Modal'],
    },
  ],
}
