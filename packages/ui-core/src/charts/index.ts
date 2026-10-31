// warp's charts without a framework (06 §12): the pure forms, the scene they lay out, and `chart`, the action that
// runs one. Its own entry, so an app that draws no chart loads none of it.
export { chart, spark, tableHTML, SSR_WIDTH, SSR_RADIUS, type ChartOptions } from './engine'
export { toHTML } from './scene'
export { sparkScene } from './spark'
export { line, bar, combo, histogram, scatter, bubble, candlestick, box, waterfall, stream, brush, type LineConfig, type BarConfig, type BarLayout, type ComboConfig, type HistConfig, type ScatterConfig, type CandleConfig, type BoxConfig, type WaterConfig, type StreamConfig, type BrushConfig, type Annotation, type Reference, type SeriesDef, type Row, type Point, type Ohlc } from './cartesian'
export { donut, radial, radar, sunburst, gauge, funnel, treemap, sankey, heat, tile, US_TILES, type DonutConfig, type RadialConfig, type RadarConfig, type SunConfig, type GaugeConfig, type FunnelConfig, type TreemapConfig, type SankeyConfig, type HeatConfig, type TileConfig, type Slice, type Band } from './shapes'
export { patch, s, type Scene, type Child } from './scene'
export { niceTicks, labelWindow, monotone, barPath, squarify, lin, quantile, seq } from './math'
export type { Form, Ctx, Plot, Tip, LegendItem, TableData } from './types'
