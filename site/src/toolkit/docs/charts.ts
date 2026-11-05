import { chart } from './charts/examples.ts'
import { circular } from './charts/circular.ts'
import { distribution } from './charts/distribution.ts'
import { hierarchy } from './charts/hierarchy.ts'
import { trends } from './charts/trends.ts'
import { summary } from './charts/summary.ts'
import type { DocGroup } from '../types.ts'

export const charts: DocGroup = {
  file: 'charts',
  title: 'Charts',
  intro: 'Bar, line, area and more, on the same colours and tooltips.',
  pack: true,
  docs: [
    {
      component: 'BarChart',
      summary: 'Compares amounts across categories, grouped, stacked or as shares of a whole.',
      use: {
        when: [
          'Comparing values across a few categories or periods',
          'Showing how a total is made up over time',
        ],
        instead: [
          { name: 'LineChart', why: 'the trend matters more than each value' },
          { name: 'DonutChart', why: 'there is one total, split a few ways' },
        ],
      },
      playground: {
        example: 'BarChartPlay',
        code: '<BarChart title="Deploys by team" data={DEPLOYS_BY_TEAM} x="quarter" series={TEAMS}{props} />',
        knobs: [
          {
            prop: 'layout',
            control: 'segmented',
            options: ['grouped', 'stacked', 'percent'],
            initial: 'grouped',
            default: 'grouped',
          },
        ],
        stage: 'fill',
        height: 420,
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            chart(
              'BarChartDeploys',
              'Grouped',
              420,
              'Each series sits side by side. Press a legend item to hide it.',
            ),
            chart(
              'BarChartStacked',
              'Stacked',
              420,
              '`layout="stacked"` shows the total as well as its parts.',
            ),
            chart(
              'BarChartPercent',
              'Percent',
              420,
              '`layout="percent"` makes every bar the same height, so the mix is what you read.',
            ),
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            chart(
              'BarChartRange',
              'With a range switch',
              420,
              'New `data` moves the bars. Anything in `toolbar` sits beside the view toggle.',
            ),
          ],
        },
      ],
      a11yNotes: [
        'The toggle in the corner swaps the plot for a real table of the same numbers.',
        'Each bar has a label, and a sentence describing the data is written for screen readers. Set `summary` to replace it.',
      ],
      propDocs: {
        layout:
          '`grouped` side by side, `stacked` on top of each other, or `percent` stacked to 100%.',
        x: 'The key in each row that names the category.',
        xName: 'What the x values are, for the table and tooltips.',
        series: 'The keys to draw, each a string or `{ key, name, color }`.',
        format: 'Turns a value into text in tooltips, labels and the table.',
        axisFormat: 'A shorter format for the axis alone.',
      },
      related: ['LineChart', 'ComboChart', 'Chart'],
    },
    {
      component: 'LineChart',
      summary:
        'Shows how values change over time, with an optional filled area, notes and target lines.',
      use: {
        when: ['The shape of the trend is the point', 'Several series share one time axis'],
        instead: [
          { name: 'BarChart', why: 'you compare separate categories' },
          { name: 'Sparkline', why: 'it is a small hint beside a number' },
        ],
      },
      playground: {
        example: 'LineChartPlay',
        code: '<LineChart title="Requests by region" data={REQUESTS_BY_REGION} x="month" series={REGIONS}{props} />',
        knobs: [
          { prop: 'area', control: 'switch', initial: false, default: false },
          { prop: 'zero', control: 'switch', initial: false, default: false },
          { prop: 'direct', control: 'switch', initial: false, default: false },
        ],
        stage: 'fill',
        height: 420,
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            chart(
              'LineChartRequests',
              'With a note and a target',
              420,
              '`annotations` mark a moment and `references` draw a level.',
            ),
            chart(
              'LineChartArea',
              'Area',
              420,
              '`area` with `zero` fills down to a true baseline.',
            ),
            chart('LineChartDirect', 'Direct labels', 420, '`direct` names each line at its end.'),
          ],
        },
      ],
      a11yNotes: [
        'Moving along the plot reads the nearest month for every series in the tooltip.',
        'The same numbers are one press away in the table view.',
      ],
      propDocs: {
        x: 'The key in each row that names the point on the x axis.',
        xName: 'What the x values are, for the table and tooltips.',
        series: 'The keys to draw, each a string or `{ key, name, color }`.',
        axisFormat: 'A shorter format for the axis alone.',
        area: 'Fills under each line.',
        zero: 'Starts the y axis at zero.',
        direct: 'Labels the lines at their ends instead of in a legend.',
        annotations: 'Notes pinned to an x value: `{ x, label }`.',
        references: 'Horizontal lines: `{ y, label }`.',
        headroom: 'Extra space above the highest value, as a share.',
      },
      related: ['BarChart', 'ComboChart', 'BrushChart', 'Sparkline'],
    },
    {
      component: 'DonutChart',
      summary: 'Splits one total into a few parts, with the total in the middle.',
      use: {
        when: ['One total split into six parts or fewer'],
        instead: [
          { name: 'BarChart', why: 'there are many parts, or you compare them over time' },
          { name: 'Treemap', why: 'there are dozens of parts' },
        ],
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            chart(
              'DonutChartRegions',
              'Donut',
              440,
              'Hover a legend item to light its slice. `unit` follows the numbers.',
            ),
            chart('DonutChartPlans', 'Pie', 440, '`pie` fills the middle.'),
            chart(
              'DonutChartCost',
              'Formatted values',
              440,
              '`format` applies to the legend, the tooltips and the table.',
            ),
          ],
        },
      ],
      propDocs: {
        pie: 'Draws a full pie instead of a ring.',
        unit: 'The word after values, like "teams".',
        name: 'What the slices are, for the table.',
      },
      related: ['RadialChart', 'Treemap', 'Sunburst'],
    },
    {
      component: 'ComboChart',
      summary: 'Draws bars for each period with a line on top, usually a moving average.',
      sections: [
        {
          kind: 'variants',
          title: 'Example',
          examples: [
            chart(
              'ComboChartRequests',
              'Bars and a moving average',
              420,
              'With no `line`, the line is the average of the last `window` bars.',
            ),
          ],
        },
      ],
      propDocs: {
        x: 'The key in each row that names the period.',
        xName: 'What the x values are, for the table and tooltips.',
        axisFormat: 'A shorter format for the axis alone.',
        bar: 'The series drawn as bars.',
        line: 'The series drawn as the line. Leave it out for a moving average.',
        window: 'How many periods the moving average covers.',
      },
      related: ['BarChart', 'LineChart'],
    },
    ...circular,
    ...distribution,
    ...hierarchy,
    ...trends,
    ...summary,
  ],
}
