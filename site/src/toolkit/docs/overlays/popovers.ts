import type { Doc } from '../../types.ts'

export const popovers: Doc[] = [
  {
    component: 'Popover',
    tile: 'PopoverTile',
    tileStage: 'narrow',
    summary: 'A small panel that opens from a button and stays out of the way.',
    use: {
      when: [
        'A few controls or a short note, next to what they affect',
        'People may carry on with the page while it is open',
      ],
      instead: [
        { name: 'Tooltip', why: 'it is a hint with nothing to press' },
        { name: 'Menu', why: 'it is a list of actions' },
        { name: 'Modal', why: 'it must be answered first' },
      ],
    },
    playground: {
      example: 'PopoverPlay',
      code: '<Popover label="Details"{props} description="Deployed 2 minutes ago by Priya." />',
      height: 280,
      knobs: [
        { prop: 'title', control: 'text', initial: 'storefront', default: '' },
        {
          prop: 'side',
          control: 'segmented',
          options: ['top', 'bottom', 'left', 'right'],
          initial: 'bottom',
          default: 'bottom',
        },
        {
          prop: 'align',
          control: 'segmented',
          options: ['start', 'center', 'end'],
          initial: 'start',
          default: 'start',
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'PopoverBasic', title: 'A short note', height: 220 },
          {
            id: 'PopoverSides',
            title: 'Placement',
            note: 'Use `side` to pick where it opens. With no room there, it flips.',
            height: 260,
          },
          {
            id: 'PopoverAligns',
            title: 'Alignment',
            note: 'Use `align` to line it up with the button.',
            height: 220,
          },
          {
            id: 'PopoverTrigger',
            title: 'Trigger styles',
            note: '`trigger` takes any Button prop.',
            height: 220,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'PopoverClose',
            title: 'Closing from inside',
            note: 'Anything with `data-close-popover` closes it.',
            height: 260,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'PopoverFilter',
            title: 'A filter',
            note: 'A popover opens a small panel from its `trigger`, here a set of filter chips.',
            height: 220,
          },
          {
            id: 'PopoverShare',
            title: 'Share a link',
            note: 'Use `title` and `description` to explain what the panel is for above its content.',
            height: 260,
          },
        ],
      },
    ],
    keyboard: [
      ['Enter', 'Opens it and moves focus inside'],
      ['Esc', 'Closes and returns focus to the button'],
      ['Tab', 'Leaving the panel closes it'],
    ],
    a11yNotes: [
      'It is a non-modal dialog, named by its title, else by its button.',
      'The button reports whether it is open.',
    ],
    propDocs: {
      inline:
        "Draws the panel open under its trigger, in the page's flow: no top layer or light dismiss. The trigger still shows and hides it. For docs and previews.",
      label: "The button's text.",
      title: 'A heading in the panel. Also names it.',
      description: 'A line under the title.',
      side: 'Which side of the button it opens on.',
      align: 'How it lines up with the button.',
      trigger: 'Button props for the trigger.',
    },
    related: ['Tooltip', 'Menu', 'Modal'],
  },
  {
    component: 'Tooltip',
    tile: 'TooltipTile',
    tileStage: 'center',
    summary: 'A short hint on hover or keyboard focus.',
    hero: 'TooltipBasic',
    use: {
      when: ['Naming an icon button', 'Showing the shortcut for an action'],
      instead: [{ name: 'Popover', why: 'it holds anything to press, or more than a few words' }],
    },
    playground: {
      example: 'TooltipPlay',
      code: '<Tooltip{props}>\n  <Button emphasis="outline" tone="neutral">Hover or focus me</Button>\n</Tooltip>',
      knobs: [
        { prop: 'content', control: 'text', initial: 'Runs on every region', default: '' },
        {
          prop: 'side',
          control: 'segmented',
          options: ['top', 'bottom', 'left', 'right'],
          initial: 'top',
          default: 'top',
        },
        { prop: 'kbd', control: 'text', initial: '⌘D', default: '' },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'TooltipBasic', title: 'A hint', note: 'Hover, or tab to the button.' },
          {
            id: 'TooltipSides',
            title: 'Placement',
            note: 'Use `side` to pick where it opens. With no room there, it flips.',
          },
          {
            id: 'TooltipAligns',
            title: 'Alignment',
            note: 'Use `align` to line it up with its trigger.',
          },
          {
            id: 'TooltipShortcut',
            title: 'With a shortcut',
            note: '`kbd` draws a key beside the words.',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'TooltipWhyDisabled',
            title: 'Saying why it is disabled',
            note: "Use `aria-disabled`: a truly `disabled` button can't be focused or hovered.",
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'TooltipIconBar',
            title: 'An icon toolbar',
            note: 'Use `content` for the tip and `kbd` to show the shortcut beside it.',
          },
          {
            id: 'TooltipStatusRow',
            title: 'Why a row failed',
            note: 'Use `side` to choose which edge the tip opens on, here `left`.',
            stage: 'narrow',
          },
        ],
      },
    ],
    keyboard: [
      ['Tab', 'Focusing the trigger shows it'],
      ['Esc', 'Hides it'],
    ],
    a11yNotes: [
      'Never put anything essential in a tooltip: touch has no hover.',
      "The tip describes its trigger, unless the trigger's name already says the same words.",
      'The trigger must be one focusable element.',
    ],
    propDocs: {
      inline:
        "Shows the tip under its trigger, in the page's flow, without waiting for hover. For docs and previews.",
      content: 'The words. Plain text only.',
      kbd: 'A key hint beside the words.',
      side: 'Which side it opens on.',
      align: 'How it lines up with its trigger.',
      children: 'The trigger: one focusable element.',
    },
    related: ['Popover', 'Button', 'Kbd'],
  },
]
