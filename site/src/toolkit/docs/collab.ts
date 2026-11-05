import { conversation } from './collab/conversation.ts'
import { presence } from './collab/presence.ts'
import { comments } from './collab/comments.ts'
import { sharing } from './collab/sharing.ts'
import type { DocGroup } from '../types.ts'

export const collab: DocGroup = {
  file: 'collab',
  title: 'Collaboration',
  intro: 'Comments, presence and sharing, for apps people use together.',
  pack: true,
  docs: [
    {
      component: 'Thread',
      summary: 'A chat: messages, day dividers, typing, reactions and a composer.',
      use: {
        when: ['A channel or a conversation', 'Long histories: only the rows on screen are drawn'],
        instead: [{ name: 'CommentThread', why: 'the talk hangs off one spot in a document' }],
      },
      tile: 'ThreadTile',
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'ThreadIncident',
              title: 'An incident channel',
              note: 'Send a message: it goes out, then Sam types and answers. All of it is a stub.',
              stage: 'fill',
              height: 580,
            },
          ],
        },
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            {
              id: 'ThreadReadOnly',
              title: 'Read only',
              note: 'No `onSend`, no composer.',
              stage: 'fill',
              height: 260,
            },
          ],
        },
      ],
      keyboard: [
        ['Enter', 'Sends'],
        ['Shift Enter', 'Adds a line'],
        ['@', 'Suggests people to mention'],
      ],
      propDocs: {
        messages: 'The messages, oldest first. A state or a list.',
        onRetry: 'Sends a failed message again.',
        onReact: 'Adds or removes a reaction.',
        onReplies: "Opens a message's replies.",
        onDrift: "Reports when a row's height was guessed wrong.",
        control: 'Gives you a handle to scroll the list.',
        composer: "The composer's props.",
      },
      related: ['Composer', 'Message', 'ConversationList'],
    },
    {
      component: 'PresenceStack',
      summary: "Who is here now: a row of avatars in each person's colour.",
      sections: [
        {
          kind: 'states',
          title: 'States',
          examples: [
            {
              id: 'PresenceStackRoom',
              title: 'People coming and going',
              note: 'Joins and leaves are announced as one summary.',
            },
          ],
        },
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            {
              id: 'PresenceStackOverflow',
              title: 'Overflow',
              note: 'Past `max`, a `+n` button opens the full list.',
              height: 240,
            },
          ],
        },
      ],
      propDocs: {
        peers: 'Who is here.',
        max: 'How many avatars before `+n`.',
        following: 'The id of the person being followed.',
        onFollow: 'Turns each avatar into a follow toggle.',
        label: 'Names the group.',
      },
      related: ['Following', 'Cursors', 'SectionPeers'],
    },
    {
      component: 'Cursors',
      summary: "Other people's pointers, with their names, over a shared document.",
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'CursorsDocument',
              title: 'A shared document',
              note: 'Each cursor is pinned to a `data-anchor` element, so it lines up at any screen size. The parent must be positioned.',
              stage: 'narrow',
              height: 220,
            },
          ],
        },
      ],
      a11yNotes: ['The layer is hidden from assistive tech. `PresenceStack` says who is here.'],
      propDocs: {
        peers: 'People and where their cursors are.',
        anchor: 'Limits the cursors to one anchor.',
        idle: 'Milliseconds before a still cursor fades.',
      },
      related: ['PeerMark', 'PeerSelection', 'PresenceStack'],
    },
    {
      component: 'CommentRail',
      summary: 'A margin of comment threads beside a document. On a phone it becomes a sheet.',
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'CommentRailDocument',
              title: 'Comments on a runbook',
              note: 'Press highlighted words to raise their thread. Press Enter in a reply to add it.',
              stage: 'fill',
              height: 420,
            },
          ],
        },
      ],
      propDocs: {
        threads: 'The threads.',
        active: 'The open thread, shared with its `CommentAnchor`.',
        onReply: 'Called with the thread and the text.',
        onResolve: 'Called when a thread is resolved or reopened.',
        label: 'Names the landmark.',
      },
      related: ['CommentAnchor', 'CommentThread'],
    },
    {
      component: 'Message',
      summary: 'One chat message, with its quote, attachment, reactions and delivery state.',
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            {
              id: 'MessageKinds',
              title: 'What a message can carry',
              note: 'An attachment, a quote, reactions, and a failed send with Retry. Usually `Thread` draws these for you.',
              stage: 'fill',
              height: 380,
            },
          ],
        },
      ],
      propDocs: {
        message: 'The message.',
        continued: 'Hides the avatar and name, for a run from one person.',
        last: 'The last of mine: only it shows Sent or Read.',
        arrive: 'Plays the arrival motion.',
        source: 'The quoted message, so its name and time stay current.',
        onRetry: 'Sends a failed message again.',
        onReact: 'Adds or removes a reaction.',
        onReplies: 'Opens its replies.',
      },
      related: ['Thread', 'Composer'],
    },
    {
      component: 'Composer',
      summary: 'Where a message is written: text, attachments, emoji and @mentions.',
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'ComposerAttach',
              title: 'Attach, mention, send',
              note: 'Attach adds a sample file here. Type @ for suggestions.',
              stage: 'narrow',
              height: 240,
            },
          ],
        },
      ],
      keyboard: [
        ['Enter', 'Sends'],
        ['Shift Enter', 'Adds a line'],
        ['↑ ↓', 'Moves through suggestions'],
        ['Esc', 'Closes the suggestions, then the quote'],
      ],
      propDocs: {
        placeholder: 'Shown while empty.',
        onSend: 'Called with the text and any quote.',
        mentions: 'People to suggest after @.',
        files: 'Attached files.',
        onRemoveFile: 'Removes one.',
        onAttach: 'Shows the attach button.',
        onTyping: 'Called as people type.',
        compact: 'Hides the keyboard hint.',
      },
      related: ['Thread', 'MentionsInput'],
    },
    ...conversation,
    ...presence,
    ...comments,
    ...sharing,
  ],
}
