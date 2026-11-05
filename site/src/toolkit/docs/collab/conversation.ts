import type { DocGroup } from '../../types.ts'

export const conversation: DocGroup['docs'] = [
  {
    component: 'ConversationList',
    summary: 'A list of channels and people, with previews and unread counts.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          { id: 'ConversationListInbox', title: 'An inbox', stage: 'narrow', height: 460 },
        ],
      },
    ],
    keyboard: [
      ['↑ ↓', 'Moves through the list'],
      ['Home End', 'Jumps to the first or last'],
      ['Enter', 'Opens it'],
    ],
    propDocs: {
      label: 'Names the list.',
      title: 'The heading.',
      actions: 'Buttons beside the heading.',
      items: 'The conversations.',
      value: 'The open one, as a state or an id.',
      onSelect: 'Called when one is picked.',
    },
    related: ['Thread'],
  },
  {
    component: 'TypingIndicator',
    summary: 'A line that says who is typing.',
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [{ id: 'TypingIndicatorNames', title: 'One person, two people' }],
      },
    ],
    propDocs: { text: 'The whole sentence, in your words.' },
    related: ['Thread', 'Composer'],
  },
  {
    component: 'Following',
    summary: "Wraps a surface that follows another person's view. Scroll or Esc stops it.",
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'FollowingPeer',
            title: 'Following from the avatars',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
    ],
    keyboard: [['Esc', 'Stops following']],
    propDocs: {
      peer: 'Who is followed, or null.',
      top: "Their viewport's top, from 0 to 1.",
      onStop: 'Called on a scroll or Esc.',
    },
    related: ['PresenceStack', 'AutoTrack'],
  },
  {
    component: 'PeerMark',
    summary: 'Text another person has selected, tinted in their colour.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'PeerMarkText', title: 'A selection in a sentence', stage: 'narrow' }],
      },
    ],
    propDocs: { peer: 'Whose selection it is.' },
    related: ['PeerSelection', 'Cursors'],
  },
]
