import type { ChatMessage } from '@weft-js/warp'
import { SAM, JUN, MARA, LENA } from './peers'

export const AT = 1_793_460_000_000

export const min = 60_000

export const CHAT: ChatMessage[] = [
  {
    id: 'm1',
    author: SAM,
    time: '15:27',
    at: AT,
    day: 'Yesterday',
    text:
      'mobile-bff d-4819 failed its ' +
      'health check on ap-south.',
  },
  {
    id: 'm2',
    author: SAM,
    time: '15:28',
    at: AT + min,
    day: 'Yesterday',
    text:
      'Looks like the retry change. ' +
      'Upstream calls pile up after ' +
      'a timeout.',
    attachment: {
      kind: 'LOG',
      name: 'd-4819.log',
      meta: '48 KB · 1,204 lines',
    },
  },
  {
    id: 'm3',
    author: JUN,
    time: '15:31',
    at: AT + 4 * min,
    day: 'Yesterday',
    text:
      'Edge cache is holding. Roll ' +
      'back and we look at it ' +
      'tomorrow?',
    reactions: [
      {
        emoji: '👍',
        label: 'Thumbs up',
        count: 2,
        names: ['Sam', 'Mara'],
      },
    ],
  },
  {
    id: 'm4',
    author: MARA,
    mine: true,
    time: '15:33',
    at: AT + 6 * min,
    day: 'Yesterday',
    text: 'Yes, roll it back. I will tell support.',
    state: 'read',
    readAt: '15:34',
  },
  {
    id: 'm5',
    author: SAM,
    time: '09:12',
    at: AT + 1060 * min,
    day: 'Today',
    text:
      'Rolled back last night. 5xx ' +
      'are at zero. @you the fix is ' +
      'on a branch.',
    mentions: ['you'],
    replies: {
      count: 2,
      last: '09:40',
      people: [JUN, LENA],
    },
  },
  {
    id: 'm6',
    author: LENA,
    time: '09:18',
    at: AT + 1066 * min,
    day: 'Today',
    quote: {
      ref: 'm2',
      text: 'Upstream calls pile up after a timeout.',
    },
    text:
      'search-api had the same thing ' +
      'in March. A jittered backoff ' +
      'fixed it.',
  },
  {
    id: 'm7',
    author: MARA,
    mine: true,
    time: '09:21',
    at: AT + 1069 * min,
    day: 'Today',
    text:
      'Good catch. Sam, can you add ' +
      'that before we retry?',
    state: 'read',
    readAt: '09:22',
  },
  {
    id: 'm8',
    author: SAM,
    time: '09:24',
    at: AT + 1072 * min,
    day: 'Today',
    text: 'On it. New deploy after lunch.',
    reactions: [
      {
        emoji: '🎉',
        label: 'Party',
        count: 1,
        names: ['Mara'],
      },
    ],
  },
]
