import type { Doc } from '../../types.ts'

export const dialogs: Doc[] = [
  {
    component: 'Modal',
    tile: 'ModalTile',
    tileStage: 'narrow',
    summary: 'A dialog that stops the page until it is answered.',
    hero: 'ModalDefault',
    use: {
      when: [
        'A decision people must make before going on',
        'A short task that needs their full attention',
      ],
      instead: [
        { name: 'Drawer', why: 'people want to see the page while they work' },
        { name: 'Popover', why: 'it is a small panel the page can carry on without' },
        { name: 'Toaster', why: 'it only tells people something happened' },
      ],
    },
    playground: {
      example: 'ModalPlay',
      code: '<Modal open={open}{props} footer={<Button data-close="">Done</Button>}>\n  ...\n</Modal>',
      knobs: [
        { prop: 'title', control: 'text', initial: 'Rename project', default: '' },
        {
          prop: 'placement',
          control: 'select',
          options: ['center', 'top', 'bottom', 'left', 'right', 'full'],
          initial: 'center',
          default: 'center',
        },
        {
          prop: 'size',
          control: 'segmented',
          options: ['sm', 'md', 'lg'],
          initial: 'md',
          default: 'md',
        },
        {
          prop: 'tone',
          control: 'segmented',
          options: ['neutral', 'critical'],
          initial: 'neutral',
          default: 'neutral',
        },
        { prop: 'alert', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Placement',
        intro: 'Use `placement` to choose where the modal opens.',
        examples: [
          { id: 'ModalCenter', title: 'Center', height: 120 },
          { id: 'ModalTop', title: 'Top', height: 120 },
          { id: 'ModalBottom', title: 'Bottom', height: 120 },
          { id: 'ModalLeft', title: 'Left', height: 120 },
          { id: 'ModalRight', title: 'Right', height: 120 },
          { id: 'ModalFull', title: 'Full', height: 120 },
        ],
      },
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'ModalSizes',
            title: 'Sizes',
            note: 'Use `size` for how wide the modal is: `sm`, `md` or `lg`.',
          },
          {
            id: 'ModalRename',
            title: 'With form',
            note: 'Give a field `autofocus` and focus lands there on open.',
            height: 220,
          },
          { id: 'ModalResult', title: 'With a mark', note: '`mark` draws above the title.' },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'ModalConfirm',
            title: 'Alert',
            note: 'With `alert`, a press outside does not close it. Put `autofocus` on the safe button.',
            height: 220,
          },
          {
            id: 'ModalLongBody',
            title: 'Scrollable content',
            note: 'The body scrolls on its own, and the header and footer stay put.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ModalInvite',
            title: 'Invite a teammate',
            note: 'Use `open` to show the modal, `footer` for its buttons, and a form in the body.',
            height: 220,
          },
        ],
      },
    ],
    keyboard: [
      ['Esc', 'Closes and returns focus to the opener'],
      ['Tab', 'Stays inside the dialog'],
    ],
    a11yNotes: [
      'It is a native `<dialog>`, so everything behind it is inert.',
      'The title names it and the description describes it.',
      'Focus goes to `autofocus`, else the title, and back to the opener on every way of closing.',
    ],
    propDocs: {
      mark: 'An icon or result mark drawn above the title, such as a success check.',
      inline:
        "Draws it open in the page's flow instead of over it: no top layer, scrim or focus trap. For docs and previews; `open` still shows and hides it.",
      open: 'A `state` holding whether it is open. The modal writes `false` when people close it.',
      title: 'Names the dialog.',
      description: 'A line under the title, read out on open.',
      footer: 'The buttons. Anything with `data-close` closes the modal.',
      size: '`sm`, `md` or `lg`.',
      placement: 'Where it opens: `center`, `top`, `bottom`, `left`, `right` or `full`.',
      alert: 'For a question that must be answered: no closing from a press outside.',
      tone: 'Colours the header. `critical` for destructive questions.',
    },
    related: ['Drawer', 'Popover', 'Button'],
  },
  {
    component: 'Drawer',
    tile: 'DrawerTile',
    tileStage: 'narrow',
    summary: 'A panel that slides in from the edge, for details and side tasks.',
    hero: 'DrawerDeployDetails',
    use: {
      when: ['Details of something picked from a list', 'A longer form or a set of filters'],
      instead: [
        { name: 'Modal', why: 'it is a decision, not a task' },
        { name: 'Popover', why: 'a few controls near the button will do' },
      ],
    },
    playground: {
      example: 'DrawerPlay',
      code: '<Drawer open={open}{props} title="Deploy d-4821" description="storefront, on main">\n  ...\n</Drawer>',
      knobs: [
        {
          prop: 'side',
          control: 'segmented',
          options: ['auto', 'right', 'left', 'top', 'bottom'],
          initial: 'right',
          default: 'auto',
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Placement',
        intro:
          'Use `side` to choose the edge. The default, `auto`, is the right side, and the bottom on phones.',
        examples: [
          { id: 'DrawerRight', title: 'Right', height: 120 },
          { id: 'DrawerLeft', title: 'Left', height: 120 },
          { id: 'DrawerTop', title: 'Top', height: 120 },
          { id: 'DrawerBottom', title: 'Bottom', height: 120 },
        ],
      },
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'DrawerFooter',
            title: 'With a footer',
            note: 'The footer stays in place while the body scrolls.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          { id: 'DrawerDeployDetails', title: 'Details of a row', stage: 'narrow', height: 300 },
          {
            id: 'DrawerFilters',
            title: 'Filters',
            note: 'A drawer holds a longer set of controls beside the page, with `footer` for its buttons.',
          },
        ],
      },
    ],
    keyboard: [
      ['Esc', 'Closes and returns focus to the opener'],
      ['Tab', 'Stays inside the drawer'],
    ],
    a11yNotes: [
      'It is a native `<dialog>`, so the page behind is inert.',
      'Focus goes to `autofocus`, else the title, never the handle.',
    ],
    propDocs: {
      inline:
        "Draws it open in the page's flow at its side's shape: no top layer, scrim or focus trap. For docs and previews; `open` still shows and hides it.",
      open: 'A `state` holding whether it is open. The drawer writes `false` when people close it.',
      title: 'Names the drawer.',
      description: 'A line under the title.',
      footer: 'Stays at the bottom. Anything with `data-close` closes the drawer.',
      side: 'Which edge. `auto` is the right, or the bottom under 600px, decided when it opens.',
    },
    related: ['Modal', 'Popover'],
  },
]
