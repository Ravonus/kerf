import type { DocGroup } from '../../types.ts'
import { chart } from './examples.ts'

export const distribution: DocGroup['docs'] = [
  {
    component: 'ScatterChart',
    summary: 'Plots items by two measures, to show a relationship between them.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'ScatterChartProjects',
            'Deploys against latency',
            440,
            'Each group in `data` gets its own colour and legend item.',
          ),
        ],
      },
    ],
    propDocs: {
      sizeName: "What a point's `size` means, for tooltips and the table.",
      xName: 'The horizontal measure.',
      yName: 'The vertical measure.',
    },
    related: ['BubbleChart'],
  },
  {
    component: 'BubbleChart',
    summary: 'A scatter chart with a third measure as the size of each point.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'BubbleChartProjects',
            'Deploys, latency and cost',
            440,
            'Each point takes `size` for its area.',
          ),
        ],
      },
    ],
    propDocs: {
      xName: 'The horizontal measure, for the axis, tooltips and the table.',
      yName: 'The vertical measure, for the axis, tooltips and the table.',
      sizeName: 'What the size means, for tooltips and the table.',
    },
    related: ['ScatterChart'],
  },
  {
    component: 'Histogram',
    summary: 'Sorts raw numbers into bins, to show how they are spread.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'HistogramLatency',
            'Request latency',
            400,
            'Pass the raw values. `binWidth` sets the size of each bin.',
          ),
        ],
      },
    ],
    propDocs: {
      binWidth: "The width of each bin, in the data's units.",
      name: 'What is being counted.',
    },
    related: ['BoxPlot'],
  },
  {
    component: 'BoxPlot',
    summary: 'Compares the spread of several groups: median, middle half and outliers.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'BoxPlotRegions',
            'Latency by region',
            400,
            'Pass raw values for each group and the box is worked out.',
          ),
        ],
      },
    ],
    related: ['Histogram'],
  },
  {
    component: 'HeatGrid',
    summary: 'Shows a value per day as shaded cells, week by week.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'HeatGridDeploys',
            'Deploys per day',
            300,
            '`data` has one array of seven per entry in `weeks`.',
          ),
        ],
      },
    ],
    propDocs: {
      weeks: 'One label per column.',
      days: 'Labels for the rows. Defaults to the days of the week.',
      unit: 'What a cell counts.',
    },
    related: ['TileMap'],
  },
  {
    component: 'RadarChart',
    summary: 'Compares a few items across the same set of scores.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'RadarChartHealth',
            'Two projects compared',
            440,
            'Values run from 0 to 1, one per axis.',
          ),
        ],
      },
    ],
    propDocs: { axes: 'The name of each score.' },
    related: ['RadialChart', 'BarChart'],
  },
]
