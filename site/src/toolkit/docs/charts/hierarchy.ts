import type { DocGroup } from '../../types.ts'
import { chart } from './examples.ts'

export const hierarchy: DocGroup['docs'] = [
  {
    component: 'Treemap',
    summary: 'Shows many parts of a total as rectangles sized by value.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'TreemapCost',
            'Cost by project',
            420,
            'Give items a `group` to colour them and get a legend.',
          ),
        ],
      },
    ],
    propDocs: {
      groups: 'The order of the groups.',
      short: 'A compact format for the labels inside rectangles.',
    },
    related: ['Sunburst', 'DonutChart'],
  },
  {
    component: 'Sunburst',
    summary: 'Shows a two-level split of a total as rings.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'SunburstSpend',
            'A bill by service',
            440,
            'The inner ring is the groups, the outer ring their children.',
          ),
        ],
      },
    ],
    propDocs: { total: 'The word under the total in the middle.' },
    related: ['Treemap', 'DonutChart'],
  },
  {
    component: 'SankeyChart',
    summary: 'Shows how amounts flow between stages and where they split.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'SankeyChartBuilds',
            'Where builds end up',
            420,
            'Links point at `nodes` by index, and each node names its column.',
          ),
        ],
      },
    ],
    propDocs: { nodes: 'Each stage: `{ name, column }`.' },
    related: ['FunnelChart'],
  },
  {
    component: 'CandlestickChart',
    summary: 'Shows the open, high, low and close of a value for each period.',
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          chart(
            'CandlestickChartLatency',
            'Candles',
            400,
            'Here a falling day is good news: the value is latency.',
          ),
          chart(
            'CandlestickChartOhlc',
            'OHLC bars',
            400,
            '`variant="ohlc"` draws thin bars with ticks.',
          ),
        ],
      },
    ],
    related: ['LineChart', 'BoxPlot'],
  },
]
