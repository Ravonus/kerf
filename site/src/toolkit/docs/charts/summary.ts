import type { DocGroup } from '../../types.ts'
import { chart } from './examples.ts'

export const summary: DocGroup['docs'] = [
  {
    component: 'Sparkline',
    summary: 'A tiny line with no axes, to show a trend beside a number.',
    use: {
      when: ['A small trend next to a figure in a card or table row'],
      instead: [{ name: 'LineChart', why: 'people need to read the values' }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          {
            id: 'SparklineStats',
            title: 'In stat cards',
            stage: 'fill',
            height: 180,
            note: 'It is hidden from screen readers, so the parent carries the meaning.',
          },
          {
            id: 'SparklineColors',
            title: 'Colours',
            stage: 'narrow',
            height: 200,
            note: '`color` takes any Warp token.',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'SparklineRows',
            title: 'One per table row',
            stage: 'fill',
            height: 240,
            note: 'It fills the width it is given, so a flexible cell lines the rows up. The ones getting slower turn amber.',
          },
        ],
      },
    ],
    a11yNotes: [
      'A sparkline is hidden from screen readers. Give its parent a label that says what the trend means.',
    ],
    propDocs: {
      values: 'The numbers to draw, oldest first.',
      color:
        "The line's colour: a Warp token such as `var(--warp-color-positive-solid)`, or any CSS colour.",
    },
    related: ['LineChart', 'StreamChart'],
  },
  {
    component: 'Chart',
    summary:
      'The frame every chart shares: title, legend, table view, and loading, empty and error states.',
    use: {
      when: [
        'You draw a form of your own and want the shared frame',
        'You need to know how charts handle loading and errors',
      ],
      instead: [{ name: 'BarChart', why: 'a named chart already fits' }],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'ChartForm',
            'A form in the frame',
            420,
            'Every named chart is this with its `form` filled in.',
          ),
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          chart(
            'ChartLoading',
            'Loading',
            300,
            'Set `state` to `loading` to show a placeholder in place of the chart.',
          ),
          chart('ChartEmpty', 'Empty', 300, 'With no data the frame shows `empty` on its own.'),
          chart(
            'ChartRetry',
            'Error and retry',
            420,
            'Press Retry. `state` swaps the plot in the same frame.',
          ),
        ],
      },
    ],
    propDocs: { form: 'The layout to draw, from `@weft-js/warp-core/charts`.' },
    related: ['BarChart', 'LineChart'],
  },
]
