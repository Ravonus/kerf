import type { DocGroup } from '../types.ts'

export const actions: DocGroup = {
  file: 'actions',
  title: 'Actions',
  intro: 'Things people press to make something happen.',
  docs: [
    {
      component: 'Button',
      summary: 'Runs an action. Use one main button per screen, and quieter ones around it.',
      hero: 'ButtonDefault',
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
          { prop: 'follow', when: { prop: 'emphasis', is: ['solid', 'soft', 'outline', 'ghost'] } },
        ],
        presets: [
          { label: 'Main action', values: { emphasis: 'solid', tone: 'accent' } },
          { label: 'Destructive', values: { emphasis: 'solid', tone: 'critical', children: 'Delete project' } },
          { label: 'Signature', values: { emphasis: 'frame', fill: true } },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'ButtonEmphasis', title: 'Emphasis', note: 'Use `emphasis` to set how loud the button is, from `solid` down to `link`.' },
          { id: 'ButtonTones', title: 'Tone', note: 'Use `tone` to say what the action means. `critical` is for anything destructive.', stage: 'start' },
          { id: 'ButtonSizes', title: 'Sizes', note: 'Use `size` for `sm`, `md` or `lg`.' },
          { id: 'ButtonFollow', title: 'Fill that follows', note: 'By default the fill wipes in from the left and out to the right. Add `follow` and, at vivid, it spreads from where the pointer comes in instead.' },
          { id: 'ButtonWithIcon', title: 'With an icon', note: 'Use `icon` to draw one before the label.' },
          { id: 'ButtonIconOnly', title: 'Icon only', note: 'Needs `label`: it becomes the accessible name.' },
          { id: 'ButtonFull', title: 'Full width', note: 'Use `full` to take the width of the container.', stage: 'narrow' },
        ] },
        { kind: 'states', title: 'States', examples: [
          { id: 'ButtonLoading', title: 'Loading', note: 'The label stays the accessible name, presses are swallowed and focus stays put.' },
          { id: 'ButtonDisabled', title: 'Disabled', note: 'Prefer `aria-disabled`: the button stays focusable, so people can find out why.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'ButtonDeleteProject', title: 'Delete confirmation', note: 'Give the confirming button `tone="critical"` and the way out a quiet `ghost` button.', stage: 'narrow' },
          { id: 'ButtonFormFooter', title: 'Form footer', note: 'End a form with a `ghost` button to cancel and a main button with `type="submit"`.', stage: 'narrow' },
          { id: 'ButtonEmptyState', title: 'Empty state', note: 'A single button with an `icon` gives an empty view one clear next step.', height: 280 },
          { id: 'ButtonSaveAsync', title: 'Save with progress', note: 'Set `loading` while the work runs, then confirm with a toast.' },
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
        follow: 'At vivid, the hover fill spreads from where the pointer comes in instead of wiping in from the left.',
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
          { id: 'ToggleSizes', title: 'Sizes', note: 'Use `size` to pick `sm`, `md` or `lg`.' },
          { id: 'ToggleIconOnly', title: 'Icon only', note: 'Pass `label` for the accessible name.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'ToggleWatch', title: 'Watch a project', note: 'Use `pressed` to show whether the project is being watched, and flip it in `onClick`.', stage: 'narrow' }] },
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
          { id: 'ChipIcons', title: 'With an icon', note: 'Use `icon` to put a small icon before a chip\'s label.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'ChipFilterList', title: 'Filtering a list', note: 'Each chip\'s `pressed` turns one filter on or off, and the list shows what matches.', stage: 'narrow', height: 300 }] },
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
          { id: 'MenuPlacement', title: 'Placement', note: 'Use `side` to pick where it opens.', height: 260 },
          { id: 'MenuAlignment', title: 'Alignment', note: 'Use `align` to line it up with the button.', height: 220 },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'MenuRowActions', title: 'A row\'s actions', note: 'Use `items` to list a row\'s actions, and `trigger` to make the button quiet enough to sit in a row.', stage: 'narrow', height: 220 }] },
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
          { id: 'CommandPaletteNested', title: 'A list inside a row', note: 'A row with `children` opens its own list. Each child\'s `run` does the work.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'CommandPaletteSearch', title: 'Search as you type', note: '`sources` are searched after `commands`. Return a promise and the rows land below, without moving the active row. Try `api`.' },
          { id: 'CommandPaletteModes', title: 'Prefixes for people and projects', note: 'Each of `modes` takes over the list when the search starts with its `prefix`. `groupOrder` fixes the order of the groups.' },
        ] },
      ],
      keyboard: [['⌘ K', 'Opens it from anywhere'], ['↑ ↓', 'Moves through the results'], ['Enter', 'Runs the highlighted command'], ['Esc', 'Closes and returns focus']],
      propDocs: { commands: 'What can be found: label, group, icon, shortcut.', hotkey: 'The letter that opens it with ⌘ or Ctrl.', onRun: 'Called with the command that was picked.' },
      related: ['Menu', 'Modal'],
    },
  ],
}
