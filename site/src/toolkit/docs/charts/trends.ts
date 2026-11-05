import type { DocGroup } from '../../types.ts'
import { chart } from './examples.ts'

export const trends: DocGroup['docs'] = [
  {
    component: 'WaterfallChart',
    summary: 'Shows how a starting total became an ending one, step by step.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'WaterfallChartSeats',
            'What moved the seat count',
            400,
            'Mark the first and last rows with `total`. Steps can be negative.',
          ),
        ],
      },
    ],
    related: ['BarChart'],
  },
  {
    component: 'StreamChart',
    summary: 'A live rolling window of a number, with a pause that shows the held data.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'StreamChartLive',
            'Live requests',
            340,
            'Replace `data` as values arrive. Pause holds the window so it can be read.',
          ),
        ],
      },
    ],
    propDocs: {
      domain: 'The fixed y range, so the axis never jumps.',
      ticks: 'The y labels.',
      reference: 'A level to watch: `{ y, label }`.',
      span: 'The label on the left edge of the window.',
      unit: 'What the number counts.',
    },
    related: ['LineChart', 'Sparkline'],
  },
  {
    component: 'BrushChart',
    summary: 'A long series with a strip below it for dragging out the part to look at.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'BrushChartSignups',
            'Signups per day',
            460,
            'Drag in the lower strip to choose a range.',
          ),
        ],
      },
    ],
    propDocs: {
      x: 'The key in each row that names the point on the x axis.',
      ticks: 'The y values that get a label.',
      domain: 'The fixed y range.',
      target: 'A level to watch: `{ y, label }`.',
      annotation: 'A note on the first value over `target`.',
      y: 'The key of the value in each row.',
    },
    related: ['LineChart'],
  },
  {
    component: 'TileMap',
    summary: 'A map of equal squares, so small places read as clearly as big ones.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'TileMapTeams',
            'Teams by state',
            400,
            'US states by default. Pass `tiles` for your own layout.',
          ),
        ],
      },
    ],
    propDocs: {
      tiles: 'Your own map: rows split by `|`, cells by `,`.',
      unit: 'What a tile counts.',
    },
    related: ['HeatGrid'],
  },
]
