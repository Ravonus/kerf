import type { DocGroup } from '../types.ts'

export const overlays: DocGroup = {
  file: 'overlays',
  title: 'Overlays',
  intro: 'Things that open above the page. Each one handles focus and closes with Escape.',
  docs: [
    {
      component: 'Modal',
      summary: 'A dialog that stops the page until it is answered.',
      use: {
        when: ['A decision people must make before going on', 'A short task that needs their full attention'],
        instead: [{ name: 'Drawer', why: 'people want to see the page while they work' }, { name: 'Popover', why: 'it is a small panel the page can carry on without' }, { name: 'Toaster', why: 'it only tells people something happened' }],
      },
      playground: {
        example: 'ModalPlay',
        code: '<Modal open={open}{props} footer={<Button data-close="">Done</Button>}>\n  ...\n</Modal>',
        knobs: [
          { prop: 'title', control: 'text', initial: 'Rename project', default: '' },
          { prop: 'size', control: 'segmented', options: ['sm', 'md', 'lg'], initial: 'md', default: 'md' },
          { prop: 'tone', control: 'segmented', options: ['neutral', 'critical'], initial: 'neutral', default: 'neutral' },
          { prop: 'alert', control: 'switch', initial: false, default: false },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'ModalRename', title: 'A short form', note: 'Give a field `autofocus` and focus lands there on open.', height: 220 },
          { id: 'ModalSizes', title: 'Sizes' },
          { id: 'ModalResult', title: 'With a mark', note: '`mark` draws above the title.' },
        ] },
        { kind: 'states', title: 'States', examples: [
          { id: 'ModalConfirm', title: 'Alert', note: '`alert` won\'t close from a press outside. `autofocus` on the safe button.', height: 220 },
          { id: 'ModalLongBody', title: 'Long content', note: 'The body scrolls on its own.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'ModalInvite', title: 'Invite a teammate', height: 220 }] },
      ],
      keyboard: [['Esc', 'Closes and returns focus to the opener'], ['Tab', 'Stays inside the dialog']],
      a11yNotes: ['It is a native `<dialog>`, so everything behind it is inert.', 'The title names it and the description describes it.', 'Focus goes to `autofocus`, else the title, and back to the opener on every way of closing.'],
      propDocs: {
        open: 'A `state` holding whether it is open. The modal writes `false` when people close it.',
        title: 'Names the dialog.',
        description: 'A line under the title, read out on open.',
        footer: 'The buttons. Anything with `data-close` closes the modal.',
        size: '`sm`, `md` or `lg`.',
        alert: 'For a question that must be answered: no closing from a press outside.',
        tone: 'Colours the header. `critical` for destructive questions.',
      },
      related: ['Drawer', 'Popover', 'Button'],
    },
    {
      component: 'Drawer',
      summary: 'A panel that slides in from the edge, for details and side tasks.',
      use: {
        when: ['Details of something picked from a list', 'A longer form or a set of filters'],
        instead: [{ name: 'Modal', why: 'it is a decision, not a task' }, { name: 'Popover', why: 'a few controls near the button will do' }],
      },
      playground: {
        example: 'DrawerPlay',
        code: '<Drawer open={open}{props} title="Deploy d-4821" description="storefront, on main">\n  ...\n</Drawer>',
        knobs: [{ prop: 'side', control: 'segmented', options: ['auto', 'right', 'left', 'bottom'], initial: 'right', default: 'auto' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'DrawerSides', title: 'Sides', note: 'The default, `auto`, is the right side, and the bottom on phones.' },
          { id: 'DrawerFooter', title: 'With a footer', note: 'The footer stays in place while the body scrolls.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'DrawerDeployDetails', title: 'Details of a row', stage: 'narrow', height: 300 },
          { id: 'DrawerFilters', title: 'Filters' },
        ] },
      ],
      keyboard: [['Esc', 'Closes and returns focus to the opener'], ['Tab', 'Stays inside the drawer']],
      a11yNotes: ['It is a native `<dialog>`, so the page behind is inert.', 'Focus goes to `autofocus`, else the title, never the handle.'],
      propDocs: {
        open: 'A `state` holding whether it is open. The drawer writes `false` when people close it.',
        title: 'Names the drawer.',
        description: 'A line under the title.',
        footer: 'Stays at the bottom. Anything with `data-close` closes the drawer.',
        side: 'Which edge. `auto` is the right, or the bottom under 600px, decided when it opens.',
      },
      related: ['Modal', 'Popover'],
    },
    {
      component: 'Popover',
      summary: 'A small panel that opens from a button and stays out of the way.',
      use: {
        when: ['A few controls or a short note, next to what they affect', 'People may carry on with the page while it is open'],
        instead: [{ name: 'Tooltip', why: 'it is a hint with nothing to press' }, { name: 'Menu', why: 'it is a list of actions' }, { name: 'Modal', why: 'it must be answered first' }],
      },
      playground: {
        example: 'PopoverPlay',
        code: '<Popover label="Details"{props} description="Deployed 2 minutes ago by Priya." />',
        height: 280,
        knobs: [
          { prop: 'title', control: 'text', initial: 'storefront', default: '' },
          { prop: 'side', control: 'segmented', options: ['top', 'bottom', 'left', 'right'], initial: 'bottom', default: 'bottom' },
          { prop: 'align', control: 'segmented', options: ['start', 'center', 'end'], initial: 'start', default: 'start' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'PopoverBasic', title: 'A short note', height: 220 },
          { id: 'PopoverSides', title: 'Sides', note: '`side` is a wish: if there is no room it flips.', height: 260 },
          { id: 'PopoverAligns', title: 'Alignment', note: '`align` lines it up with the button.', height: 220 },
          { id: 'PopoverTrigger', title: 'Trigger styles', note: '`trigger` takes any Button prop.', height: 220 },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'PopoverClose', title: 'Closing from inside', note: 'Anything with `data-close-popover` closes it.', height: 260 }] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'PopoverFilter', title: 'A filter', height: 220 },
          { id: 'PopoverShare', title: 'Share a link', height: 260 },
        ] },
      ],
      keyboard: [['Enter', 'Opens it and moves focus inside'], ['Esc', 'Closes and returns focus to the button'], ['Tab', 'Leaving the panel closes it']],
      a11yNotes: ['It is a non-modal dialog, named by its title, else by its button.', 'The button reports whether it is open.'],
      propDocs: {
        label: 'The button\'s text.',
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
      summary: 'A short hint on hover or keyboard focus.',
      use: {
        when: ['Naming an icon button', 'Showing the shortcut for an action'],
        instead: [{ name: 'Popover', why: 'it holds anything to press, or more than a few words' }],
      },
      playground: {
        example: 'TooltipPlay',
        code: '<Tooltip{props}>\n  <Button emphasis="outline" tone="neutral">Hover or focus me</Button>\n</Tooltip>',
        knobs: [
          { prop: 'content', control: 'text', initial: 'Runs on every region', default: '' },
          { prop: 'side', control: 'segmented', options: ['top', 'bottom', 'left', 'right'], initial: 'top', default: 'top' },
          { prop: 'kbd', control: 'text', initial: '⌘D', default: '' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'TooltipBasic', title: 'A hint', note: 'Hover, or tab to the button.' },
          { id: 'TooltipSides', title: 'Sides', note: 'If there is no room it flips.' },
          { id: 'TooltipShortcut', title: 'With a shortcut', note: '`kbd` draws a key beside the words.' },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'TooltipWhyDisabled', title: 'Saying why it is disabled', note: 'Use `aria-disabled`: a truly `disabled` button can\'t be focused or hovered.' }] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'TooltipIconBar', title: 'An icon toolbar' },
          { id: 'TooltipStatusRow', title: 'Why a row failed', stage: 'narrow' },
        ] },
      ],
      keyboard: [['Tab', 'Focusing the trigger shows it'], ['Esc', 'Hides it']],
      a11yNotes: ['Never put anything essential in a tooltip: touch has no hover.', 'The tip describes its trigger, unless the trigger\'s name already says the same words.', 'The trigger must be one focusable element.'],
      propDocs: {
        content: 'The words. Plain text only.',
        kbd: 'A key hint beside the words.',
        side: 'Which side it opens on.',
        children: 'The trigger: one focusable element.',
      },
      related: ['Popover', 'Button', 'Kbd'],
    },
  ],
}
