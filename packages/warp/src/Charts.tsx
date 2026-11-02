// The chart forms (06 §12), one line each: a form is a pure layout in warp-core, and `Chart` is the frame around it.
// Nothing here runs at import, so an app pays only for the forms it renders.
import { spark as sparkAction, sparkScene, SSR_WIDTH, toHTML, bar, box, brush, bubble, candlestick, combo, donut, funnel, gauge, heat, histogram, line, radar, radial, sankey, scatter, stream, sunburst, tile, treemap, waterfall, type BarConfig, type BoxConfig, type BrushConfig, type CandleConfig, type ComboConfig, type DonutConfig, type FunnelConfig, type GaugeConfig, type HeatConfig, type HistConfig, type LineConfig, type RadarConfig, type RadialConfig, type SankeyConfig, type ScatterConfig, type StreamConfig, type SunConfig, type TileConfig, type TreemapConfig, type WaterConfig } from '@weft-js/warp-core/charts'
import { state, untrack } from '@weft-js/core'
import { Button } from './Button'
import { Chart, type ChartFrame } from './Chart'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/data/tokens.css'
import '@weft-js/warp-core/styles/data/base.css'

/** Lines over a shared x axis. */
export const LineChart = (p: ChartFrame & LineConfig) => <Chart form={line} {...p} />
/** Bars, grouped or stacked. */
export const BarChart = (p: ChartFrame & BarConfig) => <Chart form={bar} {...p} />
/** Bars and lines on one plot. */
export const ComboChart = (p: ChartFrame & ComboConfig) => <Chart form={combo} {...p} />
/** A ring of parts of a whole. */
export const DonutChart = (p: ChartFrame & DonutConfig) => <Chart form={donut} {...p} />
/** Concentric arcs, one per value. */
export const RadialChart = (p: ChartFrame & RadialConfig) => <Chart form={radial} {...p} />
/** Stages narrowing from first to last. */
export const FunnelChart = (p: ChartFrame & FunnelConfig) => <Chart form={funnel} {...p} />
/** Dots at x and y. */
export const ScatterChart = (p: ChartFrame & ScatterConfig) => <Chart form={scatter} {...p} />
/** Dots at x and y, sized by a third value. */
export const BubbleChart = (p: ChartFrame & ScatterConfig) => <Chart form={bubble} {...p} />
/** Values binned into equal ranges. */
export const Histogram = (p: ChartFrame & HistConfig) => <Chart form={histogram} {...p} />
/** A grid of cells coloured by value. */
export const HeatGrid = (p: ChartFrame & HeatConfig) => <Chart form={heat} {...p} />
/** Series on axes spread around a circle. */
export const RadarChart = (p: ChartFrame & RadarConfig) => <Chart form={radar} {...p} />
/** Nested rectangles sized by value. */
export const Treemap = (p: ChartFrame & TreemapConfig) => <Chart form={treemap} {...p} />
/** Nested rings sized by value. */
export const Sunburst = (p: ChartFrame & SunConfig) => <Chart form={sunburst} {...p} />
/** Flows between stages, band width showing the amount. */
export const SankeyChart = (p: ChartFrame & SankeyConfig) => <Chart form={sankey} {...p} />
/** Open, high, low and close per period. */
export const CandlestickChart = (p: ChartFrame & CandleConfig) => <Chart form={candlestick} {...p} />
/** Quartiles and whiskers per group. */
export const BoxPlot = (p: ChartFrame & BoxConfig) => <Chart form={box} {...p} />
/** A running total, each step a rise or a fall. */
export const WaterfallChart = (p: ChartFrame & WaterConfig) => <Chart form={waterfall} {...p} />
/** A long series with a window dragged over it. */
export const BrushChart = (p: ChartFrame & BrushConfig) => <Chart form={brush} {...p} />
/** Regions drawn as equal tiles. */
export const TileMap = (p: ChartFrame & TileConfig) => <Chart form={tile} {...p} />
/** One value on an arc between its bounds. */
export const GaugeChart = (p: ChartFrame & GaugeConfig) => <Chart form={gauge} {...p} />

/** A rolling window (06 §12): one `d` write per tick on a fixed domain. Pausing holds the window and shows it as a table. */
export function StreamChart(p: ChartFrame & Omit<StreamConfig, 'paused'>) {
  const paused = state(false)
  let held = untrack(() => p.data)
  const flip = () => { held = p.data; paused.value = !paused.value }
  return <Chart form={stream} {...p} data={paused.value ? held : p.data} paused={paused.value} toolbar={<Button emphasis="outline" onClick={flip}>{paused.value ? 'Resume' : 'Pause'}</Button>} />
}

/** No axes, end dot, `aria-hidden`: a sparkline is context inside a labelled parent. */
export function Sparkline({ values, color }: { values: number[]; color?: string }) {
  let svg: SVGSVGElement | undefined
  use(sparkAction, () => svg, () => values)
  return <svg ref={n => (svg = n)} data-part="spark" viewBox={`0 0 ${SSR_WIDTH} 36`} aria-hidden="true" preserveAspectRatio="none" style={`display:block;inline-size:100%;block-size:36px;overflow:visible${color ? `;--_dc:${color}` : ''}`}
    // oxlint-disable-next-line weft/no-html-sink -- toHTML escapes every text and attribute of the scene
    innerHTML={toHTML(sparkScene(untrack(() => values), SSR_WIDTH))}></svg>
}
