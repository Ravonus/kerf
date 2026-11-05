import type { Doc } from '../../types.ts'

export const notifications: Doc[] = [
  {
    component: 'Bell',
    summary: 'The notifications button in the app bar, with a count of what is unread.',
    tileWidth: 160,
    tile: 'BellTile',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'BellWithInbox',
            title: 'With an inbox',
            note: 'Read something and the count follows.',
            height: 480,
          },
          {
            id: 'BellArrivals',
            title: 'New arrivals',
            note: 'The count bumps once for each batch. Opening clears it here.',
          },
        ],
      },
    ],
    a11yNotes: ['Its name says the count. The badge itself is hidden from assistive technology.'],
    propDocs: {
      count: 'A number, a state or a getter.',
      inbox: 'The panel. Gets `open`, a state.',
      route: 'On a phone, called instead of opening.',
      onOpen: 'It was pressed.',
    },
    related: ['Inbox', 'ConnectionPill'],
  },
  {
    component: 'Inbox',
    summary: "A person's notifications, by day, with tabs, actions and undo.",
    use: {
      when: ["Things that need someone's attention"],
      instead: [{ name: 'ActivityFeed', why: 'it only records what happened' }],
    },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'InboxPage',
            title: 'As a page',
            note: 'Approve, dismiss and undo all work. Rows are marked read after two seconds on screen.',
            stage: 'fill',
            height: 520,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'InboxLoading',
            title: 'First load',
            note: '`items` stays undefined until it arrives.',
            stage: 'fill',
            height: 280,
          },
          {
            id: 'InboxEmpty',
            title: 'Empty',
            note: 'An `Inbox` with no `items` shows its empty state.',
            stage: 'fill',
            height: 240,
          },
        ],
      },
    ],
    keyboard: [
      ['Left and Right', 'Move between the tabs'],
      ['Up and Down', 'Move between notifications'],
    ],
    a11yNotes: [
      'Rows are a `feed`, keyed, so a change patches one row and focus stays where it was.',
      'It needs a mounted Toaster for Undo.',
    ],
    propDocs: {
      items: 'Newest first. Undefined while loading.',
      variant: '`popover` for inside a Bell.',
      open: 'Is it on screen? Rows are only marked read while it is.',
      queued: 'Updates waiting to sync.',
      viewAll: 'A link to the full page.',
      onRestore: 'Undo a dismiss: put the row back.',
      onAction: "A row's button was pressed.",
      onOpen: 'Makes each row a link.',
    },
    related: ['Bell', 'ActivityFeed', 'NotificationPreferences'],
  },
  {
    component: 'ActivityFeed',
    summary: 'A quiet record of who did what, grouped by day.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ActivityFeedProject',
            title: 'Project activity',
            note: 'New rows arrive on their own when `items` changes.',
            stage: 'narrow',
            height: 420,
          },
        ],
      },
    ],
    propDocs: {
      items: 'A list, a state or a getter.',
      live: 'Shows Live while the connection is up.',
      title: 'The heading.',
      level: "The title's heading level: one below the heading the feed sits under.",
    },
    related: ['Inbox', 'Feed'],
  },
  {
    component: 'ConnectionPill',
    summary: 'A small status that says whether live updates are getting through.',
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'ConnectionPillStates',
            title: 'Each state',
            note: "Pass `.live`, a stream's status or a channel's status as `state`.",
          },
        ],
      },
    ],
    a11yNotes: ['Each change is announced once. Going offline is announced straight away.'],
    propDocs: {
      state: 'The status: a string, a state or a getter.',
      label: 'What it is the connection of.',
      queued: 'How many updates are waiting: "Back online. 4 updates."',
    },
    related: ['ConnectionBanner', 'Bell'],
  },
  {
    component: 'ConnectionBanner',
    summary: 'A full-width notice for when the connection drops, with Retry.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ConnectionBannerOffline',
            title: 'Going offline',
            note: 'Offline shows at once. Reconnecting waits for `delay`, so a blip stays quiet.',
            stage: 'fill',
            height: 180,
          },
        ],
      },
    ],
    a11yNotes: ['It stays quiet for assistive technology: the pill does the announcing.'],
    propDocs: {
      state: 'The status: a string, a state or a getter.',
      delay: 'How long to wait while reconnecting, in ms.',
      onRetry: 'Adds Retry now.',
      offline: 'The offline text.',
      reconnecting: 'The reconnecting text.',
    },
    related: ['ConnectionPill', 'Alert'],
  },
  {
    component: 'PushSoftAsk',
    summary: "Asks in your own words before the browser's notification prompt appears.",
    use: { when: ['After someone has seen why pings would help them, never on a first visit'] },
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'PushSoftAskMentions',
            title: 'Failed deploy pings',
            note: 'This page never calls the browser. Yours would, in `onAccept`.',
            stage: 'narrow',
            height: 220,
          },
        ],
      },
    ],
    propDocs: {
      title: 'The question.',
      children: 'What they would get.',
      onAccept: 'Call `Notification.requestPermission()` here.',
      onDismiss: 'Not now.',
      declined: 'Announced after Not now.',
    },
    related: ['NotificationPreferences'],
  },
  {
    component: 'NotificationPreferences',
    summary: 'A grid of what to be told about, and how.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'NotificationPreferencesWeft',
            title: 'weft notifications',
            note: 'Each change saves on its own. Security alerts must go to email, so that box is locked.',
            stage: 'fill',
            height: 680,
          },
        ],
      },
    ],
    keyboard: [
      ['Arrow keys', 'Move between cells'],
      ['Space', 'Toggles a cell'],
    ],
    a11yNotes: [
      'It is one grid with one tab stop. A channel an event cannot use still takes focus and says so.',
      'Below 560px the same rows restack.',
    ],
    propDocs: {
      groups: 'The events, grouped.',
      channels: 'The columns.',
      value: 'What is on: event, then channel.',
      offered: 'Which channels an event can use. Unlisted events can use all.',
      locked: 'Which channels an event must use.',
      lockReason: 'Why a box is locked.',
      onChange: 'A rejected promise flips the cells back and says why.',
      digest: 'How often the digest channel sends.',
      digestChannel: 'The channel the digest applies to.',
      defaults: 'Enables Reset to defaults.',
    },
    related: ['Inbox', 'PushSoftAsk'],
  },
]
