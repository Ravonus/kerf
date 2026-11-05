import type { DocGroup } from '../../types.ts'
import { chart } from './examples.ts'

export const circular: DocGroup['docs'] = [
  {
    component: 'RadialChart',
    summary: 'Shows several progress values as rings around one centre.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [chart('RadialChartGoals', 'Quarterly goals', 420, 'Values run from 0 to 1.')],
      },
    ],
    related: ['GaugeChart', 'DonutChart'],
  },
  {
    component: 'GaugeChart',
    summary: 'Shows one value between 0 and 1 against coloured bands.',
    sections: [
      {
        kind: 'variants',
        title: 'Examples',
        examples: [
          chart('GaugeChartBudget', 'One value', 340),
          chart(
            'GaugeChartUptime',
            'Side by side',
            340,
            'The colour changes as the value crosses each band.',
          ),
        ],
      },
    ],
    propDocs: {
      bands: 'Colour ranges as `[from, to, color]`.',
      label: 'The word under the number.',
    },
    related: ['RadialChart', 'Sparkline'],
  },
  {
    component: 'FunnelChart',
    summary: 'Shows how many remain at each step of a process.',
    sections: [
      {
        kind: 'variants',
        title: 'Example',
        examples: [
          chart(
            'FunnelChartSignup',
            'Signup funnel',
            400,
            'Each step also shows its share of the step before.',
          ),
        ],
      },
    ],
    propDocs: { unit: 'The word after each count, like "visitors".' },
    related: ['SankeyChart', 'BarChart'],
  },
]
