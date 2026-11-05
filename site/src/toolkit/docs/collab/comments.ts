import type { DocGroup } from '../../types.ts'

export const comments: DocGroup['docs'] = [
  {
    component: 'CommentThread',
    summary: 'A run of comments with a reply field and Resolve.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'CommentThreadReply',
            title: 'Replying',
            note: 'Press Enter in the reply field to add it.',
            stage: 'narrow',
            height: 280,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'CommentThreadResolved',
            title: 'Resolved',
            note: 'It folds to one line with Reopen.',
            stage: 'narrow',
          },
        ],
      },
    ],
    keyboard: [['Enter', 'Sends the reply']],
    propDocs: {
      thread: 'The thread.',
      active: 'Raises it.',
      onReply: 'Called with the text.',
      onResolve: 'Called when it is resolved or reopened.',
    },
    related: ['CommentRail', 'CommentAnchor'],
  },
  {
    component: 'CommentAnchor',
    summary: 'The highlighted words a comment thread hangs from.',
    sections: [
      {
        kind: 'composition',
        title: 'In context',
        examples: [{ id: 'CommentAnchorText', title: 'In a sentence', stage: 'narrow' }],
      },
    ],
    keyboard: [
      ['Enter', 'Opens its thread'],
      ['Space', 'Opens its thread'],
    ],
    propDocs: {
      thread: "The thread's id.",
      active: 'The open thread, shared with the `CommentRail`.',
    },
    related: ['CommentRail', 'CommentThread'],
  },
]
