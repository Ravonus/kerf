import type { TraceSpan } from '@kerf-js/veneer'

export const TRACE: TraceSpan[] = [
  {
    id: 'turn',
    name: 'turn',
    start: 0,
    ms: 6200,
    tokens: 14100,
    cost: 0.042,
    children: [
      {
        id: 'think',
        name: 'reasoning',
        start: 0,
        ms: 900,
        tokens: 1200,
        cost: 0.004,
      },
      {
        id: 'logs',
        name: 'read_logs',
        start: 1000,
        ms: 640,
        tokens: 3100,
        cost: 0.009,
      },
      {
        id: 'diff',
        name: 'compare_deploys',
        start: 1700,
        ms: 1900,
        children: [
          {
            id: 'fetch',
            name: 'fetch d-4801',
            start: 1750,
            ms: 700,
          },
          {
            id: 'patch',
            name: 'diff',
            start: 2500,
            ms: 1050,
          },
        ],
      },
      {
        id: 'text',
        name: 'write answer',
        start: 3700,
        ms: 2500,
        tokens: 2931,
        cost: 0.02,
      },
    ],
  },
]
