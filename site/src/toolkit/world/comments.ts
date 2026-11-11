import type { CommentThreadData } from '@kerf-js/veneer'
import { LENA, JUN, PRIYA } from './peers'

export const COMMENT_TIMEOUTS: CommentThreadData = {
  id: 'c-timeouts',
  comments: [
    {
      id: 'a',
      author: LENA,
      time: '10:12',
      text:
        'Should this say 30 seconds? ' +
        'The stale window changed on ' +
        'Friday.',
    },
    {
      id: 'b',
      author: JUN,
      time: '10:20',
      text:
        'Yes. d-4817 lowered it, I ' +
        'will update the number.',
    },
  ],
}

export const COMMENT_OWNER: CommentThreadData = {
  id: 'c-owner',
  comments: [
    {
      id: 'c',
      author: PRIYA,
      time: 'Mon',
      text:
        'Who signs off on the rollback ' +
        'rule, Mara or the on-call ' +
        'person?',
    },
  ],
}
