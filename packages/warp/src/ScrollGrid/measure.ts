import { measureEngine } from '@weft-js/core/text'
import { slices } from '@weft-js/warp-core'
import type { GridRuntime } from '../ScrollGrid'
import { LEADING } from './parts'

export function measureWrapped({
  runtime,
  rows,
  size,
  count,
}: {
  runtime: GridRuntime
  rows: { value: number[] }
  size: (row: number) => number
  count: number
}) {
  void measureEngine().then((e) => {
    if (!e || !runtime.el) return
    const c = getComputedStyle(runtime.el)
    runtime.font = `${c.fontWeight} ${c.fontSize} ${c.fontFamily}`
    runtime.line = parseFloat(c.fontSize) * LEADING
    runtime.engine = e
    runtime.ys!.refresh(rows.value[0] ?? 0, (rows.value.at(-1) ?? 0) + 1)
    let at = 0,
      lo = 0
    runtime.stop = slices(() => {
      if (at >= count) {
        runtime.ys!.refresh(lo, at)
        return false
      }
      size(at++)
      if (at - lo >= 256) {
        runtime.ys!.refresh(lo, at)
        lo = at
      }
      return true
    })
  })
}
