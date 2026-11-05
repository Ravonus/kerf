import type { DocGroup } from '../../types.ts'

export const presence: DocGroup['docs'] = [
  {
    component: 'PeerSelection',
    summary: 'An outline with a name flag, for a whole object another person has selected.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'PeerSelectionText', title: 'A selected value', stage: 'narrow' }],
      },
    ],
    propDocs: { peer: 'Whose selection it is.' },
    related: ['PeerMark', 'LockedField'],
  },
  {
    component: 'LockedField',
    summary: 'A text field held by someone else: readable and focusable, but not editable.',
    sections: [
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'LockedFieldOwner',
            title: 'Held and free',
            note: 'With `peer` set the field is `readonly`, not disabled, and the chip describes it.',
            stage: 'narrow',
            height: 240,
          },
        ],
      },
    ],
    propDocs: { peer: 'Who holds it, or null.' },
    related: ['LockIndicator', 'ConflictAlert'],
  },
  {
    component: 'LockIndicator',
    summary: 'The chip that says who is editing something.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [{ id: 'LockIndicatorPeople', title: "In each person's colour" }],
      },
    ],
    propDocs: { peer: 'Who is editing.' },
    related: ['LockedField'],
  },
  {
    component: 'ViewportRail',
    summary: 'A thin map of a document, showing where each person is looking.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'ViewportRailDocument', title: 'A picture', height: 240 },
          {
            id: 'ViewportRailJump',
            title: 'Jump to someone',
            note: '`onJump` turns each box into a button.',
            height: 240,
          },
        ],
      },
    ],
    propDocs: {
      peers: 'People and their viewports, from 0 to 1 of the document.',
      self: 'Your own viewport.',
      onJump: 'Makes each box a button.',
      label: 'Names the rail.',
    },
    related: ['SectionPeers', 'Following'],
  },
  {
    component: 'SectionPeers',
    summary: 'Small avatars beside a heading, showing who is reading that section.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'SectionPeersHeading', title: 'Beside headings', stage: 'narrow' }],
      },
    ],
    propDocs: { peers: 'Who is here.' },
    related: ['ViewportRail', 'PresenceStack'],
  },
]
