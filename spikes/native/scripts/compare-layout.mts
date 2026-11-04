// Exit check for phase 6a: lays the app out in Node (weft-layout as wasm) with the device's own leaf sizes and
// compares every frame against a device dump. Usage: npx tsx ../scripts/compare-layout.mts <frames.json> <ios|android>
import { readFileSync } from 'node:fs'
import { App, seedProducts, type Api } from '../js/src/app'
import { configure, type OS, type WindowInfo } from '../js/src/platform'
import { RecordingHost } from '../js/src/recording-host'
import { flush, mount } from '../js/src/runtime'

type Dumped = {
  id: number
  type: string
  label: string
  x: number
  y: number
  w: number
  h: number
  natW?: number
  natH?: number
}
const dump = JSON.parse(readFileSync(process.argv[2], 'utf8')) as {
  width: number
  height: number
  nodes: Dumped[]
  viewport?: WindowInfo
}

configure({ os: (process.argv[3] ?? 'ios') as OS })
const host = new RecordingHost(dump.width, dump.height)
host.resize(dump.width, dump.height, dump.viewport?.hinge) // same window class and panes as the device
host.natural = new Map(
  dump.nodes.filter((n) => n.natW !== undefined).map((n) => [n.id, [n.natW!, n.natH!]]),
)
const seed = seedProducts(150)
const api: Api = {
  listProducts: () => Promise.resolve(structuredClone(seed)),
  subscribePrices: () => () => {},
}
mount(host, () => App({ api }))
await Promise.resolve()
await Promise.resolve()
flush()

let worst = { d: 0, what: '' },
  missing = 0
for (const d of dump.nodes) {
  if (!host.nodes.has(d.id)) {
    missing++
    continue
  }
  // device frames are parent-relative; compare in the same space
  const n = host.nodes.get(d.id)!,
    f = host.frame(d.id),
    p = n.parent ? host.frame(n.parent) : { x: 0, y: 0 }
  const diff = Math.max(
    Math.abs(f.x - p.x - d.x),
    Math.abs(f.y - p.y - d.y),
    Math.abs(f.w - d.w),
    Math.abs(f.h - d.h),
  )
  if (diff > worst.d) worst = { d: diff, what: `${d.type} ${d.id} "${d.label}"` }
}
// With the device's real text metrics: a button narrower than its label wraps (or truncates) on the device.
const squeezed = dump.nodes
  .filter((d) => d.type.toLowerCase() === 'button' && d.natW !== undefined && d.natW > d.w + 0.5)
  .map((d) => `"${d.label}" ${d.natW}>${d.w}`)
console.log(
  JSON.stringify({
    nodes: dump.nodes.length,
    missing,
    maxDiffPt: +worst.d.toFixed(3),
    worst: worst.what,
    squeezed,
    pass: missing === 0 && worst.d <= 1 && squeezed.length === 0,
  }),
)
