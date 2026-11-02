import { state } from 'weft'
import { interval } from 'weft/browser'
import { bar, line } from '@weft/warp-core/charts'
import { BarChart, BoxPlot, BrushChart, BubbleChart, Button, CandlestickChart, Card, Chart, ComboChart, DonutChart, FunnelChart, GaugeChart, Grid, HeatGrid, Histogram, LineChart, RadarChart, RadialChart, Row, SankeyChart, ScatterChart, Segmented, Sparkline, Stack, StreamChart, Sunburst, Text, TileMap, Treemap, WaterfallChart } from '@weft/warp'
import { BUILD_FLOW, SEATS_BRIDGE, COST_BY_SERVICE, DEPLOY_HEAT, DEPLOY_WEEKS, DEPLOYS_BY_TEAM, GOALS, LATENCIES, LATENCY_BY_REGION, LATENCY_DAYS, PLAN_MIX, PROJECT_COSTS, PROJECT_POINTS, PROJECT_TREE, REGION_SLICES, REQUESTS_BY_REGION, SIGNUP_FUNNEL, SIGNUPS_DAILY, SKILLS, SPEND_TREE, TEAMS_BY_STATE, TRAFFIC } from '../world'

const dollars = (v: number) => `$${v.toLocaleString('en-US')}`
const thousands = (v: number) => `$${(v / 1000).toFixed(1)}k`
const millions = (v: number) => `${v}M`
const ms = (v: number) => `${Math.round(v)} ms`

const TEAMS = [{ key: 'platform', name: 'Platform' }, { key: 'web', name: 'Web' }, { key: 'data', name: 'Data' }, { key: 'mobile', name: 'Mobile' }]
const SERVICES = [{ key: 'compute', name: 'Compute' }, { key: 'storage', name: 'Storage' }, { key: 'database', name: 'Database' }, { key: 'network', name: 'Network' }]
const REGION_LINES = [{ key: 'euWest', name: 'eu-west' }, { key: 'usEast', name: 'us-east' }, { key: 'apSouth', name: 'ap-south' }]
const COST_LINE = [{ key: 'cost', name: 'Monthly bill' }]

// -- BarChart

export const BarChartPlay = (p: { layout?: 'grouped' | 'stacked' | 'percent' }) => (
  <BarChart title="Deploys by team" data={DEPLOYS_BY_TEAM} x="quarter" xName="Quarter" series={TEAMS} {...p} />
)

export const BarChartDeploys = () => (
  <BarChart title="Deploys by team" description="Last five quarters" data={DEPLOYS_BY_TEAM} x="quarter" xName="Quarter" series={TEAMS} />
)

export const BarChartStacked = () => (
  <BarChart title="Monthly bill by service" description="November to October" data={COST_BY_SERVICE} x="month" xName="Month" series={SERVICES} layout="stacked" format={dollars} />
)

export const BarChartPercent = () => (
  <BarChart title="Deploys by team" description="Each quarter as a share of its deploys" data={DEPLOYS_BY_TEAM} x="quarter" xName="Quarter" series={TEAMS} layout="percent" />
)

const RANGES = [{ value: '6', label: '6 months' }, { value: '12', label: '12 months' }]

export function BarChartRange() {
  const range = state('6')
  return (
    <BarChart
      title="Monthly bill by service"
      data={COST_BY_SERVICE.slice(-Number(range.value))}
      x="month"
      xName="Month"
      series={SERVICES}
      layout="stacked"
      format={dollars}
      toolbar={<Segmented label="Range" size="sm" value={range.value} onChange={v => (range.value = v)} options={RANGES} />}
    />
  )
}

// -- LineChart

export const LineChartPlay = (p: { area?: boolean; zero?: boolean; direct?: boolean }) => (
  <LineChart title="Requests by region" data={REQUESTS_BY_REGION} x="month" xName="Month" series={REGION_LINES} format={millions} {...p} />
)

const LAUNCH = [{ x: 'Jul', label: 'Edge cache launch' }]
const TARGET = [{ y: 36, label: 'Capacity plan' }]

export const LineChartRequests = () => (
  <LineChart title="Requests by region" description="Millions a month" data={REQUESTS_BY_REGION} x="month" xName="Month" series={REGION_LINES} format={millions} annotations={LAUNCH} references={TARGET} />
)

export const LineChartArea = () => (
  <LineChart title="Monthly bill" description="Filled to zero, so the height means something" data={TRAFFIC} x="month" xName="Month" series={COST_LINE} format={dollars} axisFormat={thousands} area zero />
)

export const LineChartDirect = () => (
  <LineChart title="Requests by region" description="Named at the line's end, no legend to look up" data={REQUESTS_BY_REGION} x="month" xName="Month" series={REGION_LINES} format={millions} direct />
)

// -- DonutChart

export const DonutChartRegions = () => (
  <DonutChart title="Requests by region" description="October, in millions" data={REGION_SLICES} name="Region" unit="million" />
)

export const DonutChartPlans = () => <DonutChart title="Teams by plan" data={PLAN_MIX} name="Plan" unit="teams" pie />

export const DonutChartCost = () => <DonutChart title="Top six projects by cost" data={PROJECT_COSTS} name="Project" format={dollars} />

// -- The rest, one form each

export const ComboChartRequests = () => (
  <ComboChart title="Monthly bill" description="Bars for each month, the line for the three-month average" data={TRAFFIC} x="month" xName="Month" bar={{ key: 'cost', name: 'Bill' }} window={3} format={dollars} axisFormat={thousands} />
)

export const RadialChartGoals = () => <RadialChart title="Q4 goals" description="Share of each target reached" data={GOALS} />

export const GaugeChartBudget = () => <GaugeChart title="Error budget used" description="30 days, storefront" data={0.64} label="Used" />

export const GaugeChartUptime = () => (
  <Grid min="md" cols={2} gap="group">
    <GaugeChart title="Error budget used" data={0.42} />
    <GaugeChart title="Build minutes used" data={0.87} />
  </Grid>
)

export const FunnelChartSignup = () => <FunnelChart title="From pricing page to paid" description="Last 90 days" data={SIGNUP_FUNNEL} unit="Teams" />

export const ScatterChartProjects = () => (
  <ScatterChart title="Busy projects stay fast" description="Each dot is one project" data={PROJECT_POINTS} xName="Deploys" yName="Latency (ms)" />
)

export const BubbleChartProjects = () => (
  <BubbleChart title="Deploys, latency and cost" description="Bigger bubbles cost more" data={PROJECT_POINTS} xName="Deploys" yName="Latency (ms)" sizeName="Cost ($100s)" />
)

export const HistogramLatency = () => (
  <Histogram title="Storefront latency" description="240 requests, last hour" data={LATENCIES} binWidth={20} format={ms} name="Requests" />
)

export const BoxPlotRegions = () => <BoxPlot title="Latency by region" description="Last hour" data={LATENCY_BY_REGION} format={ms} />

export const HeatGridDeploys = () => <HeatGrid title="Deploys per day" description="Last 26 weeks" data={DEPLOY_HEAT} weeks={DEPLOY_WEEKS} unit="deploys" />

export const RadarChartHealth = () => <RadarChart title="Project health" description="Each score out of 100" data={SKILLS.data} axes={SKILLS.axes} />

export const TreemapCost = () => <Treemap title="Cost by project" description="Grouped by team" data={PROJECT_TREE} format={dollars} short={thousands} />

export const SunburstSpend = () => <Sunburst title="October's bill" description="By service, then by what it paid for" data={SPEND_TREE} format={dollars} total="October" />

export const SankeyChartBuilds = () => <SankeyChart title="Where builds end up" description="October" data={BUILD_FLOW.data} nodes={BUILD_FLOW.nodes} />

export const CandlestickChartLatency = () => (
  <CandlestickChart title="Checkout p95 latency" description="Open, high, low and close for each day" data={LATENCY_DAYS} format={ms} />
)

export const CandlestickChartOhlc = () => <CandlestickChart title="Checkout p95 latency" data={LATENCY_DAYS} format={ms} variant="ohlc" />

export const WaterfallChartSeats = () => <WaterfallChart title="Paying seats, Q3 to Q4" description="What moved the count" data={SEATS_BRIDGE} />

const TICKS = [100, 160, 220]
const GOAL_LINE = { y: 160, label: 'Target 160' }

export const BrushChartSignups = () => (
  <BrushChart title="Signups per day" description="Drag across the lower strip to zoom" data={SIGNUPS_DAILY} x="day" y="signups" name="Signups" domain={[80, 220]} ticks={TICKS} target={GOAL_LINE} annotation="First day over target" />
)

export const TileMapTeams = () => <TileMap title="Teams by state" description="Every state the same size, so small ones still read" data={TEAMS_BY_STATE} unit="teams" />

const seed = Array.from({ length: 60 }, (_, i) => Math.round(52 + Math.sin(i / 5) * 14 + (i % 4)))
const SPIKE = { y: 75, label: 'Limit 75' }
const STREAM_TICKS = [20, 40, 60, 80]

export function StreamChartLive() {
  const data = state(seed)
  let t = 60
  interval(1000, () => {
    t++
    data.value = [...data.value.slice(1), Math.round(52 + Math.sin(t / 5) * 14 + (t % 4))]
  })
  return <StreamChart title="Requests per second" description="storefront, updates every second" data={data.value} domain={[20, 90]} ticks={STREAM_TICKS} reference={SPIKE} unit="requests per second" span="−60 s" />
}

const PULSES = [
  { name: 'Requests', value: '86.1M', values: TRAFFIC.map(t => t.requests) },
  { name: 'Deploys', value: '167', values: TRAFFIC.map(t => t.deploys) },
  { name: 'Bill', value: '$8,930', values: TRAFFIC.map(t => t.cost) },
]

export const SparklineStats = () => (
  <Grid min="sm" cols={3} gap="related">
    {PULSES.map(p => (
      <Card key={p.name}>
        <Stack gap="related" role="img" aria-label={`${p.name}: ${p.value}, rising over 12 months`}>
          <Text role="label" subtle>{p.name}</Text>
          <Text role="heading">{p.value}</Text>
          <Sparkline values={p.values} />
        </Stack>
      </Card>
    ))}
  </Grid>
)

const ERRORS = TRAFFIC.map(t => t.errors)
const DEPLOYS = TRAFFIC.map(t => t.deploys)

export const SparklineColors = () => (
  <Stack gap="group" role="img" aria-label="Errors falling, deploys rising">
    <Row gap="related" justify="between"><Text role="label">Error rate</Text><Text subtle>0.22%</Text></Row>
    <Sparkline values={ERRORS} color="var(--warp-color-critical-solid)" />
    <Row gap="related" justify="between"><Text role="label">Deploys</Text><Text subtle>167</Text></Row>
    <Sparkline values={DEPLOYS} color="var(--warp-color-positive-solid)" />
  </Stack>
)

// -- Chart

export const ChartForm = () => <Chart form={line} title="Monthly bill" data={TRAFFIC} x="month" xName="Month" series={COST_LINE} format={dollars} />

export const ChartLoading = () => <Chart form={bar} title="deploys" state="loading" data={[]} x="" series={[]} />

export const ChartEmpty = () => (
  <Chart form={bar} title="deploys" empty={{ title: 'No deploys in this range', detail: 'Try the last 90 days.' }} data={[]} x="" series={[]} />
)

export function ChartRetry() {
  const status = state<'error' | 'loading' | undefined>('error')
  const retry = () => {
    status.value = 'loading'
    setTimeout(() => (status.value = undefined), 900)
  }
  return (
    <Chart
      form={bar}
      title="deploys"
      state={status.value}
      error={{ title: 'Couldn’t load deploys', detail: 'The metrics service timed out.' }}
      action={<Button emphasis="outline" onClick={retry}>Retry</Button>}
      data={DEPLOYS_BY_TEAM}
      x="quarter"
      xName="Quarter"
      series={TEAMS}
    />
  )
}
