// One small app per chart form, for the SSR + hydrate round trip (test/charts.test.tsx) and the a11y gallery.
import {
  BarChart,
  BoxPlot,
  BrushChart,
  BubbleChart,
  CandlestickChart,
  ComboChart,
  DonutChart,
  FunnelChart,
  GaugeChart,
  HeatGrid,
  Histogram,
  LineChart,
  RadarChart,
  RadialChart,
  SankeyChart,
  ScatterChart,
  Sparkline,
  StreamChart,
  Sunburst,
  TileMap,
  Treemap,
  WaterfallChart,
} from '../../src/Charts'
import { Chart } from '../../src/Chart'
import { line } from '@kerf-js/veneer-core/charts'
import * as d from './ChartData'

const series = ['subs', 'usage', 'services']
export const Line = () => (
  <LineChart
    title="Revenue by stream"
    description="2026, monthly"
    data={d.revenue}
    x="month"
    xName="Month"
    series={series}
    format={d.money}
    zero
    annotations={[{ x: 'Sep', label: 'Usage pricing' }]}
    references={[{ y: 90000, label: 'Target' }]}
  />
)
export const Bars = () => (
  <BarChart
    title="Seats"
    data={d.seats}
    x="quarter"
    xName="Quarter"
    series={['free', 'team', 'business', 'enterprise']}
  />
)
export const Stacked = () => (
  <BarChart
    title="Seats, stacked"
    data={d.seats}
    x="quarter"
    xName="Quarter"
    series={['free', 'team', 'business', 'enterprise']}
    layout="stacked"
  />
)
export const Percent = () => (
  <BarChart
    title="Plan mix"
    data={d.seats}
    x="quarter"
    xName="Quarter"
    series={['free', 'team', 'business', 'enterprise']}
    layout="percent"
  />
)
export const Combo = () => (
  <ComboChart
    title="Revenue and trend"
    data={d.combo}
    x="month"
    xName="Month"
    bar="revenue"
    format={d.money}
  />
)
export const Donut = () => (
  <DonutChart title="Teams by plan" data={d.slices} unit="teams" name="Plan" />
)
export const Pie = () => <DonutChart title="Teams, pie" data={d.slices} pie name="Plan" />
export const Radial = () => <RadialChart title="Goal progress" data={d.goals} />
export const Funnel = () => <FunnelChart title="Trial funnel" data={d.steps} unit="Teams" />
export const Scatter = () => (
  <ScatterChart title="Teams" data={d.groups} xName="Seats" yName="Health" />
)
export const Bubble = () => (
  <BubbleChart title="Accounts" data={d.groups} xName="Seats" yName="Health" sizeName="ARR" />
)
export const Hist = () => (
  <Histogram
    title="Latency"
    data={d.latency}
    binWidth={20}
    format={(v) => `${v}ms`}
    name="Requests"
  />
)
export const Heat = () => (
  <HeatGrid title="Deploys" data={d.heat.data} weeks={d.heat.weeks} unit="deploys" />
)
export const Radar = () => (
  <RadarChart title="Toolkit profile" data={d.radar.data} axes={d.radar.axes} />
)
export const Tree = () => <Treemap title="Budget by project" data={d.budget} />
export const Sun = () => <Sunburst title="Cloud spend" data={d.spend} />
export const Sankey = () => (
  <SankeyChart title="Acquisition flow" data={d.flow.data} nodes={d.flow.nodes} />
)
export const Candle = () => <CandlestickChart title="ACME, daily" data={d.candles} />
export const Ohlc = () => <CandlestickChart title="ACME, OHLC" data={d.candles} variant="ohlc" />
export const Box = () => <BoxPlot title="Latency by region" data={d.regions} />
export const Water = () => <WaterfallChart title="ARR bridge" data={d.bridge} />
export const Stream = () => (
  <StreamChart
    title="Requests per second"
    data={d.window60}
    domain={[20, 90]}
    ticks={[20, 40, 60, 80]}
    reference={{ y: 75, label: 'limit 75' }}
    unit="requests per second"
    span="−60 s"
  />
)
export const Brush = () => (
  <BrushChart
    title="Signups, daily"
    data={d.signups}
    x="day"
    y="signups"
    domain={[60, 260]}
    ticks={[100, 180, 260]}
    target={{ y: 180, label: 'target 180' }}
    annotation="first over target"
    format={(v) => String(Math.round(v))}
  />
)
export const Tile = () => <TileMap title="Teams per state" data={d.states} unit="teams" />
export const Gauge = () => (
  <GaugeChart title="Error budget used" description="Bands at 50 / 80%" data={0.64} />
)
export const Spark = () => (
  <div role="img" aria-label="Revenue, rising">
    <Sparkline values={[3, 5, 4, 8, 9]} />
  </div>
)
export const Loading = () => (
  <Chart form={line} title="signups" state="loading" data={[]} x="" series={[]} />
)
export const Empty = () => (
  <Chart
    form={line}
    title="signups"
    empty={{ title: 'No signups in this range', detail: 'Try the last 90 days.' }}
    data={[]}
    x=""
    series={[]}
  />
)
export const Failed = () => (
  <Chart
    form={line}
    title="signups"
    state="error"
    error={{ title: 'Couldn’t load signups', detail: 'The metrics service timed out.' }}
    action={<button type="button">Retry</button>}
    data={[]}
    x=""
    series={[]}
  />
)
