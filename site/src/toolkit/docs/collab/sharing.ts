import type { DocGroup } from '../../types.ts'

export const sharing: DocGroup['docs'] = [
  {
    component: 'VersionHistory',
    summary: 'Past versions of a document. Preview one, then restore it as a new version.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'VersionHistoryRunbook',
            title: "A runbook's history",
            note: 'Named versions carry a dot. Restoring adds a version, so nothing is lost.',
            stage: 'narrow',
            height: 340,
          },
        ],
      },
    ],
    propDocs: {
      versions: 'Newest first.',
      preview: 'Draws a version in the preview dialog.',
      onPreview: 'Called when one is opened.',
      onRestore: 'Makes a new version from this one.',
      label: 'Names the list.',
    },
    related: ['SyncIndicator'],
  },
  {
    component: 'ShareDialog',
    summary: 'Invite people, set their roles, and choose who a link works for.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ShareDialogRunbook',
            title: 'Sharing a runbook',
            note: 'Copy link writes a sample URL to your clipboard.',
            height: 220,
          },
        ],
      },
    ],
    propDocs: {
      open: 'Whether it shows. You own this state.',
      title: 'What is being shared.',
      members: 'Who has access.',
      people: 'People the invite field suggests. Any email works too.',
      link: "The link's access and role.",
      url: 'What Copy link writes.',
      onInvite: 'Called with the emails and role.',
      onRoleChange: 'Called with a role, or null to remove the person.',
      onLinkAccess: 'Called when the link changes.',
    },
    related: ['InviteDialog', 'PresenceStack'],
  },
  {
    component: 'SyncIndicator',
    summary: 'A quiet word beside the title: Saved, Saving or Offline.',
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'SyncIndicatorStates',
            title: 'Each state',
            note: 'Use `state` to show `saved`, `saving` or `offline`.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          { id: 'SyncIndicatorTitle', title: 'While you type', stage: 'narrow', height: 240 },
        ],
      },
    ],
    propDocs: { state: '`saved`, `saving` or `offline`.' },
    related: ['ConflictAlert', 'ConnBanner'],
  },
  {
    component: 'ConflictAlert',
    summary: 'Two people changed one value. Shows both, and lets you pick.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ConflictAlertReviewDate',
            title: 'A date changed twice',
            note: 'Nothing is thrown away: you hold both values until a button fires.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
    ],
    propDocs: {
      field: "The field's name.",
      peer: 'Who changed it.',
      time: 'When.',
      theirs: 'Their value.',
      yours: 'Your value.',
      onUseTheirs: 'Takes theirs.',
      onKeepMine: 'Keeps yours.',
      onCompare: 'Shows Compare.',
    },
    related: ['SyncIndicator', 'LockedField'],
  },
  {
    component: 'SyncedForm',
    summary: 'A form whose named fields are shared live with everyone in it.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SyncedFormRunbook',
            title: 'Editing together',
            note: 'The buttons stand in for Jun. His edit rings the field and names him. If you are in the field, it waits until you leave.',
            stage: 'narrow',
            height: 340,
          },
        ],
      },
    ],
    propDocs: {
      ops: "Other people's edits, oldest first.",
      onSend: 'Called with each local edit.',
      label: 'Names the form.',
    },
    related: ['DataIntegrity', 'ConflictAlert'],
  },
  {
    component: 'DataIntegrity',
    summary: 'A developer panel for a live channel: sent, received, duplicates and lag.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'DataIntegrityChannel',
            title: 'Testing a channel',
            note: 'The buttons add to the counts here, the way a test client would.',
            stage: 'fill',
            height: 360,
          },
        ],
      },
    ],
    propDocs: {
      channel: "The channel's name.",
      stats: 'The counts.',
      events: 'The recent events.',
      live: 'Shows a live status.',
      onInjectDuplicate: 'Sends a duplicate.',
      onInjectReorder: 'Sends events out of order.',
      onReset: 'Clears the counts.',
    },
    related: ['SyncedForm'],
  },
  {
    component: 'AutoTrack',
    summary: 'A region that scrolls to whatever the presenter is on, until you scroll yourself.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'AutoTrackPresenter',
            title: 'Following a walkthrough',
            note: 'The buttons stand in for Jun. Scroll the region yourself to pause it, then Resume.',
            stage: 'narrow',
            height: 360,
          },
        ],
      },
    ],
    propDocs: {
      presenter: 'Who is presenting, or null.',
      section: 'The `data-section` they are on.',
      label: 'Names the region.',
      height: "The region's height in pixels.",
    },
    related: ['Following'],
  },
]
