import type { Doc } from '../types.ts'

export const billingDocs: Doc[] = [
  {
    component: 'SeatsMeter',
    summary: "Shows how many of a plan's seats are in use.",
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'SeatsMeterLevels',
            title: 'Filling up',
            note: 'A full plan turns caution.',
            stage: 'narrow',
            height: 220,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'SeatsMeterInvite', title: 'Above a member list', stage: 'narrow' }],
      },
    ],
    propDocs: { used: 'Seats taken, pending invites included.', total: 'Seats on the plan.' },
    related: ['MembersTable', 'UsageMeter'],
  },
  {
    component: 'RolesMatrix',
    summary: 'A grid of what each role is allowed to do.',
    tile: 'RolesMatrixTile',
    tileStage: 'fill',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'RolesMatrixReadOnly', title: 'Read only', stage: 'fill', height: 320 },
          {
            id: 'RolesMatrixEdit',
            title: 'Editable',
            note: 'Pass `onToggle` and each cell becomes a checkbox.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
    ],
    propDocs: {
      roles: 'The columns.',
      permissions: 'The rows: a label and the roles that have it.',
      onToggle: 'Called when a cell changes. Without it the grid is read only.',
    },
    related: ['MembersTable'],
  },
  {
    component: 'InviteDialog',
    summary: 'Invite several people by email and pick their role, checked against the seats left.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'InviteDialogTeam',
            title: 'Inviting teammates',
            note: 'Try four addresses: the seat check runs before anything is sent.',
          },
        ],
      },
    ],
    propDocs: {
      open: 'Whether it shows. You own this state.',
      roles: 'The roles to offer.',
      defaultRole: 'The role selected at the start.',
      seatsLeft: 'Seats still free.',
      onSend: 'Sends them. A thrown error keeps the dialog and its tags.',
    },
    related: ['MembersTable', 'TagsInput', 'SeatsMeter'],
  },
  {
    component: 'TagsInput',
    summary: 'Type several values into one field, each becoming a tag you can remove.',
    use: {
      when: ['A free list of short values, like emails or labels'],
      instead: [{ name: 'Combobox', why: 'the values come from a known list' }],
    },
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'TagsInputEmails',
            title: 'With validation',
            note: '`valid` keeps a bad tag in the field, marked critical.',
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'TagsInputLabels', title: 'Project labels', stage: 'narrow' }],
      },
    ],
    keyboard: [
      ['Enter or ,', 'Adds what you typed'],
      ['Backspace', 'Highlights the last tag, then removes it'],
    ],
    propDocs: {
      value: 'The tags, as a state.',
      valid: 'Return false to mark a tag critical.',
      onEdit: 'Called when the tags change, to clear a stale error.',
      onSubmit: 'Called on Enter with nothing typed.',
    },
    related: ['InviteDialog', 'Tag', 'Combobox'],
  },
  {
    component: 'ApiKeys',
    summary: 'List, create and revoke API keys. A new key is shown once.',
    tile: 'ApiKeysTile',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ApiKeysTest',
            title: 'Test keys',
            note: 'Create one to see the secret screen. Revoking a key used in the last day asks you to type its name: CI deploys is one.',
            stage: 'fill',
            height: 300,
          },
        ],
      },
    ],
    propDocs: {
      keys: 'The keys: only ever a prefix, never the secret.',
      kind: '`test` or `live`, for the words on the page.',
      now: 'The current time, for "last used" and the one-day revoke rule.',
      scopes: 'The scopes to offer.',
      expiries: 'The expiry choices.',
      onReauth: 'Ask for a fresh sign-in first. Resolve false to stop.',
      onCreate: 'Creates the key and returns its full secret.',
      onRevoke: 'Revokes it.',
    },
    related: ['ReauthDialog', 'SignGate', 'Webhooks'],
  },
  {
    component: 'UsageMeter',
    summary: 'How much of a limit is used, with a warning at 80% and stripes past the limit.',
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'UsageMeterLevels',
            title: 'From fine to over',
            note: '`note` shows from 80%. `overage` replaces it past the limit.',
            stage: 'narrow',
            height: 380,
          },
        ],
      },
    ],
    a11yNotes: ['The rail is a `meter`, and `format` shapes the words it speaks.'],
    propDocs: {
      label: 'What is being measured.',
      value: 'The amount used.',
      limit: "The plan's limit.",
      format: 'Turns a number into words: `n => n + " GB"`.',
      overage: 'What past the limit costs.',
      note: 'Shown as it gets close to the limit.',
      action: 'A link to a bigger plan.',
    },
    related: ['UsageMeters', 'SeatsMeter', 'PlanPicker'],
  },
  {
    component: 'UsageMeters',
    summary: 'Lays out a group of usage meters.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          { id: 'UsageMetersThisMonth', title: 'This month on Team', stage: 'fill', height: 240 },
        ],
      },
    ],
    related: ['UsageMeter'],
  },
  {
    component: 'Invoices',
    summary: 'Past invoices, with a pinned banner if a payment failed.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [{ id: 'InvoicesHistory', title: 'Paid history', stage: 'fill', height: 520 }],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'InvoicesFailed',
            title: 'A failed payment',
            note: 'Press Update payment method to clear it here.',
            stage: 'fill',
            height: 400,
          },
        ],
      },
    ],
    propDocs: {
      invoices: 'The rows.',
      currency: 'A currency code.',
      locale: 'The locale for the amounts.',
      onUpdatePayment: "The banner's button.",
      onExport: 'Shows Export CSV.',
    },
    related: ['PaymentMethods', 'UsageMeter'],
  },
  {
    component: 'PaymentMethods',
    summary: 'Saved cards, shown by their last four digits, with make default and remove.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'PaymentMethodsSaved',
            title: 'Saved cards',
            note: 'Removing a card offers Undo.',
            stage: 'narrow',
            height: 260,
          },
        ],
      },
    ],
    propDocs: {
      methods: 'The cards.',
      onAdd: 'Shows Add method.',
      onDefault: 'Makes one the default.',
      onRemove: 'Removes one.',
      onRestore: 'Undo for a removal.',
    },
    related: ['PayFrame', 'Invoices'],
  },
]
