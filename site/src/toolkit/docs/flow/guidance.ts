import type { Doc } from '../../types.ts'

export const flowGuidance: Doc[] = [
  {
    component: 'Checklist',
    summary: 'Onboarding steps with a progress rail, ending in "You\'re set up".',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ChecklistSetup',
            title: 'Getting started',
            note: 'Press Do it on each step to see the ending. In your app the items come from the server.',
            stage: 'narrow',
            height: 380,
          },
        ],
      },
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'ChecklistSelfChecked',
            title: 'Checked by hand',
            note: 'Pass `onToggle` to let people tick the boxes.',
            stage: 'narrow',
            height: 340,
          },
        ],
      },
    ],
    propDocs: {
      title: 'The heading.',
      subtitle: 'One line under it.',
      doneTitle: 'The heading once all are done.',
      doneDescription: 'One line under it.',
      onHide: 'Shows Hide, and a toast with Undo.',
      onUndoHide: 'Undo for a hide.',
      collapsible: 'Folds on the title, for phones.',
      footer: 'A row under the list.',
    },
    related: ['Tour', 'Coachmark'],
  },
  {
    component: 'Tour',
    summary: 'A short guided walk over the real interface, one spotlight at a time.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'TourDashboard',
            title: 'A dashboard tour',
            note: 'It starts only on request. A missing target skips its step.',
            height: 240,
          },
        ],
      },
    ],
    keyboard: [
      ['→', 'Next step'],
      ['←', 'Previous step'],
      ['Esc', 'Ends it and returns focus'],
    ],
    propDocs: {
      steps: 'A target selector, a title and a body.',
      open: 'Whether it runs: a state or a value.',
      onDone: 'It ran to the end.',
      onSkip: 'It was skipped.',
      onStepChange: "Called with the step's index.",
    },
    related: ['Coachmark', 'Checklist'],
  },
  {
    component: 'Coachmark',
    summary: 'One tip on one control: a beacon, and a card when pressed.',
    tile: 'CoachmarkTile',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'CoachmarkNewFeature', title: 'A new button', height: 260 }],
      },
    ],
    keyboard: [['Esc', 'Closes the card']],
    propDocs: {
      target: 'A selector for what it points at.',
      title: "The tip's heading.",
      body: 'The tip.',
      onDismiss: 'Remember the dismissal here.',
    },
    related: ['Tour', 'Tooltip'],
  },
  {
    component: 'SystemPage',
    summary: 'The pages for not found, no access, server error, maintenance and nothing yet.',
    tile: 'SystemPageTile',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'SystemPage404', title: 'Not found', stage: 'narrow', height: 420 },
          {
            id: 'SystemPage403',
            title: 'No access',
            note: 'Asking for access moves it to pending, with Withdraw.',
            stage: 'narrow',
            height: 520,
          },
          {
            id: 'SystemPage500',
            title: 'Server error',
            note: "Pair it with `<Boundary>`. The error's message is never shown.",
            stage: 'narrow',
            height: 340,
          },
          {
            id: 'SystemPageMaintenance',
            title: 'Maintenance',
            note: 'Use `kind` set to `maintenance` with `backAt` to say when the service returns.',
            stage: 'narrow',
            height: 300,
          },
          {
            id: 'SystemPageEmpty',
            title: 'Nothing yet',
            note: 'Use `kind` set to `empty` with `primary` and `secondary` to offer a first step.',
            stage: 'narrow',
            height: 300,
          },
        ],
      },
    ],
    propDocs: {
      kind: 'Which page.',
      title: 'Replaces the heading.',
      description: 'Replaces the line under it.',
      code: 'The small line above the heading.',
      primary: 'The main action.',
      secondary: 'The quieter action.',
      as: 'The heading level.',
    },
    related: ['ConnBanner', 'RateLimited'],
  },
  {
    component: 'ConnBanner',
    summary: 'A banner for offline, reconnecting, or a new version of the app.',
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'ConnBannerOffline',
            title: 'Offline',
            note: 'Retry reconnects after a moment. The toggle stands in for the network.',
            stage: 'fill',
            height: 180,
          },
          {
            id: 'ConnBannerNewVersion',
            title: 'A new version',
            note: 'Set `stale` when a new build is out, and `onReload` and `onLater` handle the two choices.',
            stage: 'fill',
            height: 180,
          },
        ],
      },
    ],
    related: ['SyncIndicator', 'RateLimited'],
  },
  {
    component: 'RateLimited',
    summary: 'Says a limit was reached and holds the button until the wait is over.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'RateLimitedExport',
            title: 'After too many exports',
            note: 'The wait comes from the server, never a guess. Press Replay to run it again.',
            stage: 'narrow',
            height: 200,
            replay: true,
          },
        ],
      },
    ],
    related: ['ConnBanner', 'AuditLog'],
  },
  {
    component: 'ShortcutsOverlay',
    summary: 'Lists the shortcuts in use now, grouped and searchable. Press ? to open it.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ShortcutsOverlayApp',
            title: "An app's shortcuts",
            note: 'Press ? anywhere outside a field. The list comes from what is registered, not from a hand-kept page.',
          },
        ],
      },
    ],
    keyboard: [
      ['?', 'Opens it'],
      ['Esc', 'Closes it'],
    ],
    propDocs: {
      open: 'Whether it shows, if you want to own it.',
      shortcuts: 'The list to read. Default: the shared one.',
    },
    related: ['Kbd', 'CommandPalette'],
  },
]
