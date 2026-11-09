// Text measurement and incremental preparation for a virtual list.
import { untrack } from '@weft-js/core'
import type { MeasureHandle, MeasureProvider } from '@weft-js/core/text'
import { slices, type VirtualKey, type Virtualizer } from '@weft-js/warp-core'
import { metricOf, type Metric } from './VirtualList-metrics'
import type { VirtualListProps } from './VirtualList-types'
import type { virtualData } from './VirtualList-data'

type MeasureOptions = Parameters<MeasureProvider['prepare']>[2]
const BATCH = 256

/** Prepare and measure rows using the list's live references. */
export function virtualMeasurements<T>(
  read: () => VirtualListProps<T>,
  data: ReturnType<typeof virtualData<T>>,
  refs: { readonly list: HTMLElement | undefined; readonly virtualizer: Virtualizer | undefined },
) {
  const props = untrack(read)
  const { items, keyOf, variantOf } = data
  let engine: MeasureProvider | null = null
  const work: Work = { stop: undefined, slicing: false, cursor: 0 }
  let measuredAt = -1
  const metrics = new Map<string, Metric>()
  const prepared = new Map<VirtualKey, { text: string; handle: MeasureHandle; font: string }>()
  const probes = new Map<string, HTMLElement>()
  const prepare = rowPreparer({ props, data, refs, metrics, prepared, current: () => engine })

  const size = (i: number) => {
    if (!engine) return
    const item = items.value[i]!,
      m = metrics.get(variantOf(item)),
      p = prepared.get(keyOf(item))
    if (!m || !p || p.text !== props.text?.(item)) return
    return m.chrome + Math.max(m.line, engine.layout(p.handle, m.wrap, m.line).height)
  }

  function calibrate() {
    metrics.clear()
    for (const [name, probe] of probes) {
      const m = metricOf(probe)
      if (m) metrics.set(name, m)
    }
    measuredAt = refs.list?.getBoundingClientRect().width ?? -1
  }

  const prepareAll = rowBatch(data, refs, prepare, work)

  function start() {
    calibrate()
    prepareAll()
  }

  const fontsDone = () => {
    engine?.clear()
    prepared.clear()
    start()
  }

  return {
    metrics,
    prepared,
    probes,
    prepare,
    size,
    calibrate,
    prepareAll,
    start,
    fontsDone,
    get engine() {
      return engine
    },
    set engine(value) {
      engine = value
    },
    get measuredAt() {
      return measuredAt
    },
    get slicing() {
      return work.slicing
    },
    get cursor() {
      return work.cursor
    },
    stop: () => work.stop?.(),
  }
}

type Refs = {
  readonly list: HTMLElement | undefined
  readonly virtualizer: Virtualizer | undefined
}
type Prepared = Map<VirtualKey, { text: string; handle: MeasureHandle; font: string }>
type Work = { stop: (() => void) | undefined; slicing: boolean; cursor: number }

function rowPreparer<T>({
  props,
  data,
  refs,
  metrics,
  prepared,
  current,
}: {
  props: VirtualListProps<T>
  data: ReturnType<typeof virtualData<T>>
  refs: Refs
  metrics: Map<string, Metric>
  prepared: Prepared
  current: () => MeasureProvider | null
}) {
  const { items, variantOf, keyOf, index } = data
  return (i: number) => {
    const item = untrack(() => items.value[i]),
      m = metrics.get(variantOf(item!)),
      value = props.text?.(item!)
    if (!current() || !m || value == null) return false
    const key = keyOf(item!),
      had = prepared.get(key)
    if (had && had.text === value && had.font === m.font) return false
    // Preserved white space leaves the fast tier, so it's asked for only by text that has some to preserve.
    const handle = current()!.prepare(
      value,
      m.font,
      m.opts.whiteSpace === 'pre-wrap' && !/\n| {2}|\t/.test(value)
        ? ({ ...m.opts, whiteSpace: 'normal' } as MeasureOptions)
        : (m.opts as MeasureOptions),
    )
    prepared.set(key, { text: value, handle, font: m.font })
    void handle.ready?.then(() => {
      const at = index.value.get(key)
      if (at !== undefined) refs.virtualizer?.refresh(at, at + 1)
    })
    return true
  }
}

function rowBatch<T>(
  data: ReturnType<typeof virtualData<T>>,
  refs: Refs,
  prepare: (i: number) => boolean,
  work: Work,
) {
  const { items, shown, index } = data
  return () => {
    work.stop?.()
    work.slicing = true
    work.cursor = 0
    for (const key of shown.value) {
      const i = index.value.get(key)
      if (i !== undefined) prepare(i)
    }
    refs.virtualizer?.refresh()
    let lo = 0,
      done = 0
    work.stop = slices(() => {
      if (work.cursor >= items.value.length) {
        work.slicing = false
        if (work.cursor > lo) refs.virtualizer?.refresh(lo, work.cursor)
        return false
      }
      if (prepare(work.cursor++)) done++
      if (done >= BATCH) {
        refs.virtualizer?.refresh(lo, work.cursor)
        lo = work.cursor
        done = 0
      }
      return true
    })
  }
}
