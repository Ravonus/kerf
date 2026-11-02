import type { DocGroup, ExampleRef } from '../types.ts'

const chart = (id: string, title: string, height = 420, note?: string): ExampleRef => ({ id, title, stage: 'fill', height, note })

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
        when: ['Comparing values across a few categories or periods', 'Showing how a total is made up over time'],
        instead: [{ name: 'LineChart', why: 'the trend matters more than each value' }, { name: 'DonutChart', why: 'there is one total, split a few ways' }],
      },
      playground: {
        example: 'BarChartPlay',
        code: '<BarChart title="Deploys by team" data={DEPLOYS_BY_TEAM} x="quarter" series={TEAMS}{props} />',
        knobs: [{ prop: 'layout', control: 'segmented', options: ['grouped', 'stacked', 'percent'], initial: 'grouped', default: 'grouped' }],
        stage: 'fill',
        height: 420,
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          chart('BarChartDeploys', 'Grouped', 420, 'Each series sits side by side. Press a legend item to hide it.'),
          chart('BarChartStacked', 'Stacked', 420, '`layout="stacked"` shows the total as well as its parts.'),
          chart('BarChartPercent', 'Percent', 420, '`layout="percent"` makes every bar the same height, so the mix is what you read.'),
        ] },
        { kind: 'composition', title: 'In context', examples: [chart('BarChartRange', 'With a range switch', 420, 'New `data` moves the bars. Anything in `toolbar` sits beside the view toggle.')] },
      ],
      a11yNotes: ['The toggle in the corner swaps the plot for a real table of the same numbers.', 'Each bar has a label, and a sentence describing the data is written for screen readers. Set `summary` to replace it.'],
      propDocs: { layout: '`grouped` side by side, `stacked` on top of each other, or `percent` stacked to 100%.', x: 'The key in each row that names the category.', xName: 'What the x values are, for the table and tooltips.', series: 'The keys to draw, each a string or `{ key, name, color }`.', format: 'Turns a value into text in tooltips, labels and the table.', axisFormat: 'A shorter format for the axis alone.' },
      related: ['LineChart', 'ComboChart', 'Chart'],
    },
    {
      component: 'LineChart',
      summary: 'Shows how values change over time, with an optional filled area, notes and target lines.',
      use: {
        when: ['The shape of the trend is the point', 'Several series share one time axis'],
        instead: [{ name: 'BarChart', why: 'you compare separate categories' }, { name: 'Sparkline', why: 'it is a small hint beside a number' }],
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
        { kind: 'variants', title: 'Variants', examples: [
          chart('LineChartRequests', 'With a note and a target', 420, '`annotations` mark a moment and `references` draw a level.'),
          chart('LineChartArea', 'Area', 420, '`area` with `zero` fills down to a true baseline.'),
          chart('LineChartDirect', 'Direct labels', 420, '`direct` names each line at its end.'),
        ] },
      ],
      a11yNotes: ['Moving along the plot reads the nearest month for every series in the tooltip.', 'The same numbers are one press away in the table view.'],
      propDocs: { x: 'The key in each row that names the point on the x axis.', xName: 'What the x values are, for the table and tooltips.', series: 'The keys to draw, each a string or `{ key, name, color }`.', axisFormat: 'A shorter format for the axis alone.', area: 'Fills under each line.', zero: 'Starts the y axis at zero.', direct: 'Labels the lines at their ends instead of in a legend.', annotations: 'Notes pinned to an x value: `{ x, label }`.', references: 'Horizontal lines: `{ y, label }`.', headroom: 'Extra space above the highest value, as a share.' },
      related: ['BarChart', 'ComboChart', 'BrushChart', 'Sparkline'],
    },
    {
      component: 'DonutChart',
      summary: 'Splits one total into a few parts, with the total in the middle.',
      use: {
        when: ['One total split into six parts or fewer'],
        instead: [{ name: 'BarChart', why: 'there are many parts, or you compare them over time' }, { name: 'Treemap', why: 'there are dozens of parts' }],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          chart('DonutChartRegions', 'Donut', 440, 'Hover a legend item to light its slice. `unit` follows the numbers.'),
          chart('DonutChartPlans', 'Pie', 440, '`pie` fills the middle.'),
          chart('DonutChartCost', 'Formatted values', 440, '`format` applies to the legend, the tooltips and the table.'),
        ] },
      ],
      propDocs: { pie: 'Draws a full pie instead of a ring.', unit: 'The word after values, like "teams".', name: 'What the slices are, for the table.' },
      related: ['RadialChart', 'Treemap', 'Sunburst'],
    },
    {
      component: 'ComboChart',
      summary: 'Draws bars for each period with a line on top, usually a moving average.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('ComboChartRequests', 'Bars and a moving average', 420, 'With no `line`, the line is the average of the last `window` bars.')] }],
      propDocs: { x: 'The key in each row that names the period.', xName: 'What the x values are, for the table and tooltips.', axisFormat: 'A shorter format for the axis alone.', bar: 'The series drawn as bars.', line: 'The series drawn as the line. Leave it out for a moving average.', window: 'How many periods the moving average covers.' },
      related: ['BarChart', 'LineChart'],
    },
    {
      component: 'RadialChart',
      summary: 'Shows several progress values as rings around one centre.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('RadialChartGoals', 'Quarterly goals', 420, 'Values run from 0 to 1.')] }],
      related: ['GaugeChart', 'DonutChart'],
    },
    {
      component: 'GaugeChart',
      summary: 'Shows one value between 0 and 1 against coloured bands.',
      sections: [{ kind: 'variants', title: 'Examples', examples: [
        chart('GaugeChartBudget', 'One value', 340),
        chart('GaugeChartUptime', 'Side by side', 340, 'The colour changes as the value crosses each band.'),
      ] }],
      propDocs: { bands: 'Colour ranges as `[from, to, color]`.', label: 'The word under the number.' },
      related: ['RadialChart', 'Sparkline'],
    },
    {
      component: 'FunnelChart',
      summary: 'Shows how many remain at each step of a process.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('FunnelChartSignup', 'Signup funnel', 400, 'Each step also shows its share of the step before.')] }],
      propDocs: { unit: 'The word after each count, like "visitors".' },
      related: ['SankeyChart', 'BarChart'],
    },
    {
      component: 'ScatterChart',
      summary: 'Plots items by two measures, to show a relationship between them.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('ScatterChartProjects', 'Deploys against latency', 440, 'Each group in `data` gets its own colour and legend item.')] }],
      propDocs: { sizeName: 'What a point\'s `size` means, for tooltips and the table.', xName: 'The horizontal measure.', yName: 'The vertical measure.' },
      related: ['BubbleChart'],
    },
    {
      component: 'BubbleChart',
      summary: 'A scatter chart with a third measure as the size of each point.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('BubbleChartProjects', 'Deploys, latency and cost', 440, 'Each point takes `size` for its area.')] }],
      propDocs: { xName: 'The horizontal measure, for the axis, tooltips and the table.', yName: 'The vertical measure, for the axis, tooltips and the table.', sizeName: 'What the size means, for tooltips and the table.' },
      related: ['ScatterChart'],
    },
    {
      component: 'Histogram',
      summary: 'Sorts raw numbers into bins, to show how they are spread.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('HistogramLatency', 'Request latency', 400, 'Pass the raw values. `binWidth` sets the size of each bin.')] }],
      propDocs: { binWidth: 'The width of each bin, in the data\'s units.', name: 'What is being counted.' },
      related: ['BoxPlot'],
    },
    {
      component: 'BoxPlot',
      summary: 'Compares the spread of several groups: median, middle half and outliers.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('BoxPlotRegions', 'Latency by region', 400, 'Pass raw values for each group and the box is worked out.')] }],
      related: ['Histogram'],
    },
    {
      component: 'HeatGrid',
      summary: 'Shows a value per day as shaded cells, week by week.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('HeatGridDeploys', 'Deploys per day', 300, '`data` has one array of seven per entry in `weeks`.')] }],
      propDocs: { weeks: 'One label per column.', days: 'Labels for the rows. Defaults to the days of the week.', unit: 'What a cell counts.' },
      related: ['TileMap'],
    },
    {
      component: 'RadarChart',
      summary: 'Compares a few items across the same set of scores.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('RadarChartHealth', 'Two projects compared', 440, 'Values run from 0 to 1, one per axis.')] }],
      propDocs: { axes: 'The name of each score.' },
      related: ['RadialChart', 'BarChart'],
    },
    {
      component: 'Treemap',
      summary: 'Shows many parts of a total as rectangles sized by value.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('TreemapCost', 'Cost by project', 420, 'Give items a `group` to colour them and get a legend.')] }],
      propDocs: { groups: 'The order of the groups.', short: 'A compact format for the labels inside rectangles.' },
      related: ['Sunburst', 'DonutChart'],
    },
    {
      component: 'Sunburst',
      summary: 'Shows a two-level split of a total as rings.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('SunburstSpend', 'A bill by service', 440, 'The inner ring is the groups, the outer ring their children.')] }],
      propDocs: { total: 'The word under the total in the middle.' },
      related: ['Treemap', 'DonutChart'],
    },
    {
      component: 'SankeyChart',
      summary: 'Shows how amounts flow between stages and where they split.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('SankeyChartBuilds', 'Where builds end up', 420, 'Links point at `nodes` by index, and each node names its column.')] }],
      propDocs: { nodes: 'Each stage: `{ name, column }`.' },
      related: ['FunnelChart'],
    },
    {
      component: 'CandlestickChart',
      summary: 'Shows the open, high, low and close of a value for each period.',
      sections: [{ kind: 'variants', title: 'Examples', examples: [
        chart('CandlestickChartLatency', 'Candles', 400, 'Here a falling day is good news: the value is latency.'),
        chart('CandlestickChartOhlc', 'OHLC bars', 400, '`variant="ohlc"` draws thin bars with ticks.'),
      ] }],
      related: ['LineChart', 'BoxPlot'],
    },
    {
      component: 'WaterfallChart',
      summary: 'Shows how a starting total became an ending one, step by step.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('WaterfallChartSeats', 'What moved the seat count', 400, 'Mark the first and last rows with `total`. Steps can be negative.')] }],
      related: ['BarChart'],
    },
    {
      component: 'StreamChart',
      summary: 'A live rolling window of a number, with a pause that shows the held data.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('StreamChartLive', 'Live requests', 340, 'Replace `data` as values arrive. Pause holds the window so it can be read.')] }],
      propDocs: { domain: 'The fixed y range, so the axis never jumps.', ticks: 'The y labels.', reference: 'A level to watch: `{ y, label }`.', span: 'The label on the left edge of the window.', unit: 'What the number counts.' },
      related: ['LineChart', 'Sparkline'],
    },
    {
      component: 'BrushChart',
      summary: 'A long series with a strip below it for dragging out the part to look at.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('BrushChartSignups', 'Signups per day', 460, 'Drag in the lower strip to choose a range.')] }],
      propDocs: { x: 'The key in each row that names the point on the x axis.', ticks: 'The y values that get a label.', domain: 'The fixed y range.', target: 'A level to watch: `{ y, label }`.', annotation: 'A note on the first value over `target`.', y: 'The key of the value in each row.' },
      related: ['LineChart'],
    },
    {
      component: 'TileMap',
      summary: 'A map of equal squares, so small places read as clearly as big ones.',
      sections: [{ kind: 'variants', title: 'Example', examples: [chart('TileMapTeams', 'Teams by state', 400, 'US states by default. Pass `tiles` for your own layout.')] }],
      propDocs: { tiles: 'Your own map: rows split by `|`, cells by `,`.', unit: 'What a tile counts.' },
      related: ['HeatGrid'],
    },
    {
      component: 'Sparkline',
      summary: 'A tiny line with no axes, to show a trend beside a number.',
      use: { when: ['A small trend next to a figure in a card or table row'], instead: [{ name: 'LineChart', why: 'people need to read the values' }] },
      sections: [{ kind: 'variants', title: 'Examples', examples: [
        { id: 'SparklineStats', title: 'In stat cards', stage: 'fill', height: 180, note: 'It is hidden from screen readers, so the parent carries the meaning.' },
        { id: 'SparklineColors', title: 'Colours', stage: 'narrow', height: 200, note: '`color` takes any warp token.' },
      ] },
      { kind: 'composition', title: 'In context', examples: [
        { id: 'SparklineRows', title: 'One per table row', stage: 'fill', height: 240, note: 'It fills the width it is given, so a flexible cell lines the rows up. The ones getting slower turn amber.' },
      ] }],
      a11yNotes: ['A sparkline is hidden from screen readers. Give its parent a label that says what the trend means.'],
      propDocs: { values: 'The numbers to draw, oldest first.', color: 'The line\'s colour: a warp token such as `var(--warp-color-positive-solid)`, or any CSS colour.' },
      related: ['LineChart', 'StreamChart'],
    },
    {
      component: 'Chart',
      summary: 'The frame every chart shares: title, legend, table view, and loading, empty and error states.',
      use: { when: ['You draw a form of your own and want the shared frame', 'You need to know how charts handle loading and errors'], instead: [{ name: 'BarChart', why: 'a named chart already fits' }] },
      sections: [
        { kind: 'variants', title: 'Example', examples: [chart('ChartForm', 'A form in the frame', 420, 'Every named chart is this with its `form` filled in.')] },
        { kind: 'states', title: 'States', examples: [
          chart('ChartLoading', 'Loading', 300, 'Set `state` to `loading` to show a placeholder in place of the chart.'),
          chart('ChartEmpty', 'Empty', 300, 'With no data the frame shows `empty` on its own.'),
          chart('ChartRetry', 'Error and retry', 420, 'Press Retry. `state` swaps the plot in the same frame.'),
        ] },
      ],
      propDocs: { form: 'The layout to draw, from `@weft-js/warp-core/charts`.' },
      related: ['BarChart', 'LineChart'],
    },
  ],
}
