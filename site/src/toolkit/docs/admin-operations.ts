import type { Doc } from '../types.ts'

export const operationsDocs: Doc[] = [
  {
    component: 'PayFrame',
    summary: 'The styled slot your payment provider fills. Veneer never draws card fields itself.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'PayFrameTestMode',
            title: 'Mounted, in test mode',
            note: "`mount` gets the element and the Veneer tokens for the provider's appearance API.",
            stage: 'narrow',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'PayFrameLoading',
            title: 'Loading',
            note: 'It shimmers until `ready`, or until a `src` frame has loaded.',
            stage: 'narrow',
          },
        ],
      },
    ],
    a11yNotes: ['`title` names what is inside, for screen readers.'],
    propDocs: { testMode: 'Shows a Test mode badge.' },
    related: ['Checkout', 'PaymentMethods'],
  },
  {
    component: 'AuditLog',
    summary: 'A read-only record of who did what, with filters, details and export.',
    tile: 'AuditLogTile',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'AuditLogWorkspace',
            title: 'Workspace activity',
            note: 'Open a row with a change to see its details. Export answers with a limit here, so the button counts down.',
            stage: 'fill',
            height: 680,
          },
        ],
      },
    ],
    propDocs: {
      events: 'The rows.',
      now: 'The current time, for "2 hours ago".',
      categories: 'The filter options.',
      live: 'Shows a live status, when rows arrive in real time.',
      onExport: 'Shows Export CSV.',
    },
    related: ['Table', 'ApiKeys'],
  },
  {
    component: 'IntegrationsGrid',
    summary: 'Connected apps as cards: their state, one line, one action.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'IntegrationsGridWorkspace',
            title: 'Workspace integrations',
            note: 'Connect Linear to walk through the states. Configure opens a drawer with `settings` inside.',
            stage: 'fill',
            height: 560,
          },
        ],
      },
    ],
    propDocs: {
      items: 'The integrations, as a state, so `state` can change.',
      onConnect: "Send people to the provider's consent page.",
      settings: 'The fields in the Configure drawer.',
      onSave: 'Saves the drawer.',
      onDisconnect: 'Disconnects.',
      onRestore: 'Undo for a disconnect.',
    },
    related: ['Webhooks'],
  },
  {
    component: 'Webhooks',
    summary: 'Endpoints that get your events, with a test button and a signing secret shown once.',
    tileWidth: 470,
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'WebhooksEndpoints',
            title: 'Deploy events',
            note: 'Add endpoint shows the secret once. Send test calls a stub here.',
            stage: 'fill',
            height: 320,
          },
        ],
      },
    ],
    propDocs: {
      hooks: 'The endpoints.',
      events: 'The events people can pick.',
      onAdd: 'Adds the endpoint and returns its signing secret.',
      onTest: 'Sends a sample event and returns the status and time.',
    },
    related: ['ApiKeys', 'IntegrationsGrid'],
  },
  {
    component: 'CsvImport',
    summary: 'Upload a CSV, match its columns, fix bad rows, and import.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CsvImportTeam',
            title: 'Importing teammates',
            note: 'Press Use the sample. It has one bad email and one bad role, so the review step has something to say.',
            stage: 'fill',
            height: 420,
          },
        ],
      },
    ],
    propDocs: {
      targets: 'The fields to fill, with aliases and checks.',
      noun: 'What a row is, singular and plural.',
      rowLimit: 'The most rows it accepts.',
      sample: 'Offers a sample file.',
      onImport: 'Runs the import and reports progress from 0 to 100.',
    },
    related: ['MembersTable'],
  },
  {
    component: 'CartButton',
    summary: 'The cart icon with a count badge, and the count said in words.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CartButtonCount',
            title: 'A count that changes',
            note: 'The badge bumps once on each new number. No items, no badge.',
          },
        ],
      },
    ],
    a11yNotes: ['Its name is "Cart, 3 items", so the number is never colour or position alone.'],
    propDocs: { count: 'The items in the cart.', onClick: 'Usually opens a `CartDrawer`.' },
    related: ['CartDrawer'],
  },
  {
    component: 'CartDrawer',
    summary: 'The cart in a side sheet, with quantities, the subtotal and Checkout.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CartDrawerShop',
            title: 'The Kerf shop',
            note: 'Taking the last one away removes the line and offers Undo.',
          },
        ],
      },
    ],
    propDocs: {
      open: 'Whether it shows. You own this state.',
      cart: 'The lines, as a state.',
      currency: 'A currency code.',
      locale: 'The locale for the amounts.',
      onCheckout: 'Called after the drawer closes.',
    },
    related: ['CartButton', 'LineItem', 'Checkout'],
  },
  {
    component: 'LineItem',
    summary: 'One line of a cart: name, variant, quantity stepper and price.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'LineItemCart',
            title: 'A cart on a page',
            note: 'It writes straight to `cart`, so the stepper needs no handlers.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
    ],
    propDocs: {
      line: 'The line to draw.',
      cart: 'The whole cart, as a state.',
      currency: 'A currency code.',
      locale: 'The locale for the amounts.',
      problem: 'A critical badge, such as Out of stock.',
    },
    related: ['CartDrawer', 'Checkout'],
  },
  {
    component: 'OrderConfirmation',
    summary: 'The thank-you screen: the order number, where the receipt went, and the tracker.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'OrderConfirmationPlaced',
            title: 'After checkout',
            stage: 'narrow',
            height: 340,
            replay: true,
          },
        ],
      },
    ],
    a11yNotes: ['It is announced politely when it appears.'],
    propDocs: {
      orderId: 'The order number.',
      email: 'Where the receipt went.',
      note: 'A line about delivery.',
      stage: 'How far along the order is.',
      summary: 'The lines and totals, if you want them here.',
      titleId: 'An id for the heading.',
      onTrack: 'Shows Track order.',
      onContinue: 'Shows Continue shopping.',
    },
    related: ['OrderTracker', 'Checkout'],
  },
  {
    component: 'OrderTracker',
    summary: "An order's progress: placed, packed, shipped, delivered.",
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [{ id: 'OrderTrackerStages', title: 'Each stage', stage: 'narrow' }],
      },
    ],
    propDocs: { stage: 'The current stop.' },
    related: ['OrderConfirmation'],
  },
]
