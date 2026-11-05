import type { Doc } from '../types.ts'

export const settingsDocs: Doc[] = [
  {
    component: 'SettingsLayout',
    summary: 'The frame of a settings page: a list of sections beside a form that holds them.',
    use: {
      when: [
        'A settings page with several sections',
        'People need to jump to one part of a long form',
      ],
      instead: [{ name: 'Tabs', why: 'each part is its own page' }],
    },
    tile: 'SettingsLayoutTile',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SettingsLayoutProject',
            title: 'Project settings',
            note: 'The list sits on top in a narrow column and beside the form from 760px wide. A press scrolls to the section and moves focus to its heading.',
            stage: 'fill',
            height: 580,
          },
        ],
      },
    ],
    a11yNotes: ['The sections are a `nav`, and the current one has `aria-current`.'],
    propDocs: {
      label: 'Names the list of sections for screen readers.',
      sections: 'One entry per section: `id` matches a `SettingsSection`.',
      current: 'The id of the section marked as current.',
      onNavigate: 'Called with the id when a section is pressed.',
    },
    related: ['SettingsSection', 'SettingRow', 'SaveBar', 'DangerZone'],
  },
  {
    component: 'MembersTable',
    summary: 'Everyone in a workspace, with roles, bulk removal and pending invites.',
    tile: 'MembersTableTile',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'MembersTableTeam',
            title: 'The weft team',
            note: 'Role changes apply at once with Undo. The last owner cannot be demoted, and the select says why.',
            stage: 'fill',
            height: 620,
          },
        ],
      },
    ],
    propDocs: {
      me: 'The signed-in member, who gets a warning before demoting themselves.',
      roles: 'The roles to offer.',
      owner: 'The value of the role that must always have someone in it.',
      seats: 'Seats on the plan. Pending invites use one each.',
      onRemove: 'Called with the members to remove, after people confirm.',
      onRestore: 'Undo for a removal.',
      onInvite: 'Called with the emails and role from the invite dialog.',
      onRevoke: 'Takes back a pending invite.',
    },
    related: ['InviteDialog', 'SeatsMeter', 'RolesMatrix'],
  },
  {
    component: 'PlanPicker',
    summary: 'Compare plans, see the price difference, and switch.',
    tile: 'PlanPickerTile',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'PlanPickerTeam',
            title: 'Changing plan',
            note: 'Pick Scale to see the prorated price. Pick Hobby to see `losses` listed in the dialog.',
            stage: 'fill',
            height: 440,
          },
        ],
      },
    ],
    propDocs: {
      current: 'The id of the plan the workspace is on.',
      selected: 'The checked card, when something else needs to set it.',
      interval: 'Monthly or yearly, when you want to own it.',
      seats: 'Seats, for the price.',
      daysLeft: 'Days left in this period, for the proration.',
      periodDays: 'The length of a period in days.',
      preview: "Your server's proration, to replace the built-in one.",
      losses: 'What stops working on a downgrade.',
      onChange: 'Makes the change. Resolve with a message to keep the dialog open and show it.',
    },
    related: ['UsageMeter', 'Invoices', 'PaymentMethods'],
  },
  {
    component: 'Checkout',
    summary: 'Cart, address, shipping, payment and review, as one guided flow.',
    tileWidth: 380,
    tile: 'CheckoutTile',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CheckoutShop',
            title: 'The weft shop',
            note: 'Nothing is charged. Try the code `WEFT10`. Going back keeps what you typed.',
            stage: 'fill',
            height: 460,
          },
        ],
      },
    ],
    propDocs: {
      cart: 'The lines, as a state, so quantity changes flow through the totals.',
      shipping: 'The delivery choices.',
      countries: 'Country codes for the address form.',
      defaultCountry: 'The country selected at the start.',
      addressProvider: 'Address lookup, if you have one.',
      taxRate: 'A flat rate, such as `0.08`.',
      payment: "The payment step's body, usually a `PayFrame`.",
      wallet: "A saved wallet's button above the card form.",
      coupon: 'Checks a code. Resolve undefined when it is not valid.',
      idempotencyKey: 'Your key for this attempt, sent again on a retry.',
      onPlaceOrder:
        'Places the order. Return the order, or a typed error that sends people to the right step.',
      onStepChange: 'Called on every step change.',
      onContinueShopping: 'The button on the final step.',
      signInHref: 'Shows a sign-in link at the start.',
    },
    related: ['CartDrawer', 'PayFrame', 'OrderConfirmation'],
  },
  {
    component: 'SettingsSection',
    summary: 'A heading, one line of help, and a bordered group of setting rows.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SettingsSectionNotifications',
            title: 'Email preferences',
            stage: 'fill',
            height: 240,
          },
        ],
      },
    ],
    propDocs: {
      id: 'Anchors the section, and matches its `SettingsLayout` entry.',
      title: 'The heading.',
      description: 'One line under the heading.',
      tone: '`critical` draws the danger border.',
      as: 'The heading level.',
    },
    related: ['SettingsLayout', 'SettingRow', 'DangerZone'],
  },
  {
    component: 'SettingRow',
    summary: 'One setting: its name and help on one side, its control on the other.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'SettingRowControls',
            title: 'Controls in a row',
            note: 'Pass `children` as a function to label a Switch with the row\'s own words. Use `layout="stack"` for a wide field.',
            stage: 'fill',
            height: 340,
          },
        ],
      },
    ],
    a11yNotes: [
      'A function child gets the ids of the title and the help, for `aria-labelledby` and `aria-describedby`.',
    ],
    propDocs: {
      title: "The setting's name.",
      description: 'What it does.',
      layout: '`stack` puts the control on its own line.',
    },
    related: ['SettingsSection', 'Switch'],
  },
  {
    component: 'SaveBar',
    summary: 'A bar that rises when a form has unsaved changes, with Save and Discard.',
    use: {
      when: ['A long form that saves as a whole'],
      instead: [{ name: 'Switch', why: 'each setting saves itself the moment it changes' }],
    },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SaveBarProject',
            title: 'Project form',
            note: 'Clear the name and press Save to see a field error hold the bar up. Discard puts the snapshot back.',
            stage: 'narrow',
            height: 320,
          },
        ],
      },
    ],
    keyboard: [['Enter', 'Saves, from any field in the form']],
    propDocs: {
      values: "The form's live values, as a state. The bar compares them to a snapshot.",
      errors: 'Where field errors are written, for your fields to read.',
    },
    related: ['SettingsLayout', 'Input'],
  },
  {
    component: 'DangerZone',
    summary: 'The one section with a critical border, for actions that are hard to undo.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'DangerZoneProject',
            title: 'Project danger zone',
            note: 'A plain confirm for what can be reversed, type to confirm for what cannot.',
            stage: 'fill',
            height: 280,
          },
        ],
      },
    ],
    propDocs: {
      id: 'Anchors the section.',
      title: 'The heading.',
      description: 'What these actions put at risk.',
    },
    related: ['ConfirmDialog', 'TypeToConfirm', 'SettingRow'],
  },
  {
    component: 'ConfirmDialog',
    summary: 'Asks people to confirm one action, with the focus on Cancel.',
    use: {
      when: ['The action affects other people or is awkward to reverse'],
      instead: [{ name: 'TypeToConfirm', why: 'it cannot be undone' }],
    },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ConfirmDialogPause',
            title: 'Pausing deploys',
            note: 'The confirm button shows progress and the dialog closes when `onConfirm` finishes.',
          },
          {
            id: 'ConfirmDialogRevoke',
            title: 'A destructive batch',
            note: 'Say what happens on the button, with the count.',
          },
        ],
      },
    ],
    keyboard: [
      ['Esc', 'Cancels and returns focus'],
      ['Enter', 'Presses the focused button'],
    ],
    propDocs: {
      open: 'Whether it shows. You own this state.',
      action: "The confirm button's words.",
      cancel: "The cancel button's words.",
      tone: '`critical` for anything destructive.',
      glyph: 'An icon at the top of the dialog.',
      onConfirm: 'Do the work here. A thrown error keeps the dialog and offers Retry.',
      onCancel: 'Called on Cancel.',
    },
    related: ['TypeToConfirm', 'Modal', 'DangerZone'],
  },
  {
    component: 'TypeToConfirm',
    summary: 'Makes people type a name before an action that cannot be undone.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'TypeToConfirmDelete',
            title: 'Deleting a project',
            note: 'The button stays disabled until the text matches exactly.',
          },
        ],
      },
    ],
    keyboard: [
      ['Enter', 'Confirms once the text matches'],
      ['Esc', 'Cancels and returns focus'],
    ],
    a11yNotes: ['Focus goes to the field, not to Cancel, because typing is the next step.'],
    propDocs: {
      open: 'Whether it shows. You own this state.',
      confirmText: 'The exact text to type.',
      items: 'What goes, listed.',
      action: "The confirm button's words.",
      glyph: 'The icon at the top.',
      onConfirm: 'Do the work here. A thrown error keeps the dialog and offers Retry.',
    },
    related: ['ConfirmDialog', 'DangerZone'],
  },
]
