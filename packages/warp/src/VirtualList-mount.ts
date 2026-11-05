// Mount the virtualizer and attach text-measurement observers.
import { DEV, effect, flush, onCleanup, onMount, untrack, type State } from '@weft-js/core'
import { measureEngine, type MeasureProvider } from '@weft-js/core/text'
import { virtualizer, type VirtualKey, type Virtualizer } from '@weft-js/warp-core'
import type { virtualData } from './VirtualList-data'
import type { virtualMeasurements } from './VirtualList-measure'
import type { VirtualControl, VirtualListProps } from './VirtualList-types'

type Refs = {
  readonly el: HTMLElement | undefined
  readonly list: HTMLElement | undefined
  virtualizer: Virtualizer | undefined
}
type Bindings = {
  active: State<VirtualKey | undefined>
  pending: State<VirtualKey | undefined>
  waiting: [HTMLElement, VirtualKey, (undo: () => void) => void][]
  control: VirtualControl
  reveal: (key: VirtualKey) => void
  edges: (indices: number[]) => void
}
type Context<T> = {
  props: VirtualListProps<T>
  data: ReturnType<typeof virtualData<T>>
  measure: ReturnType<typeof virtualMeasurements<T>>
  refs: Refs
  bindings: Bindings
  dials?: MutationObserver | undefined
}

/** Register mounting and cleanup under the list's owner. */
export function mountVirtualList<T>(
  read: () => VirtualListProps<T>,
  data: ReturnType<typeof virtualData<T>>,
  measure: ReturnType<typeof virtualMeasurements<T>>,
  refs: Refs,
  bindings: Bindings,
) {
  const ctx: Context<T> = { props: untrack(read), data, measure, refs, bindings }
  onMount(() => {
    queueMicrotask(() => initialize(ctx))
    onCleanup(() => {
      measure.stop()
      ctx.dials?.disconnect()
      document.fonts?.removeEventListener?.('loadingdone', measure.fontsDone)
      refs.virtualizer?.destroy()
    })
  })
}

function initialize<T>(ctx: Context<T>) {
  const { props, data, measure, refs, bindings } = ctx
  const { keys, shown } = data
  const { metrics, prepared, prepare, size, calibrate } = measure
  const { active, pending, waiting, control, reveal, edges } = bindings
  if (!refs.el) return
  refs.virtualizer = virtualizer(refs.el, {
    keys: untrack(() => keys.value),
    spacer: refs.list!,
    estimate: untrack(() => props.estimate ?? 48),
    gap: untrack(() => props.gap),
    overscan: untrack(() => props.overscan),
    stick: untrack(() => props.stick),
    from: untrack(() => props.from),
    size: (i, width) => {
      if (width !== measure.measuredAt && metrics.size) calibrate()
      return size(i)
    },
    pinned: () => (active.value === undefined ? [] : [active.value]),
    onRange: (indices) => {
      for (const i of indices) prepare(i)
      shown.value = indices.map((i) => keys.value[i]!)
      edges(indices)
    },
    onStick: (s) => props.onStick?.(s),
    onDrift: (i, p, a) => {
      props.onDrift?.(i, p, a)
      if (DEV && measure.engine && Math.abs(p - a) > 1 && prepared.has(keys.value[i]!))
        console.debug(`weft: X001 row ${i} predicted ${p}px and renders ${a}px`)
    },
  })
  for (const [row, key, keep] of waiting.splice(0)) keep(refs.virtualizer.attach(row, key))
  effect(
    () => keys.value,
    (k) => {
      refs.virtualizer!.update({ keys: k })
      const key = untrack(() => pending.value)
      if (key !== undefined) reveal(key)
    },
  )
  effect(
    () => active.value,
    () => refs.virtualizer!.update({}),
  )
  untrack(() => props.control?.(control))
  if (!untrack(() => props.text)) return

  void measureEngine().then((engine) => startMeasurement(ctx, engine))
}

function startMeasurement<T>(ctx: Context<T>, e: MeasureProvider | null) {
  const { data, measure, refs } = ctx
  const { items, samples, probing } = data
  const { metrics, prepare, calibrate, prepareAll, start, fontsDone } = measure
  if (!e || !refs.el) return
  measure.engine = e
  probing.value = true
  flush()
  start()
  effect(
    () => items.value,
    (_, prev) => {
      if (prev === undefined) return
      let lo = -1,
        hi = 0
      const to = measure.slicing ? measure.cursor : items.value.length
      for (let i = 0; i < to; i++)
        if (prepare(i)) {
          if (lo < 0) lo = i
          hi = i + 1
        }
      if (lo >= 0) refs.virtualizer!.refresh(lo, hi)
    },
  )
  effect(
    () => samples.value.length,
    () => {
      // a kind of row that wasn't here at the start
      if (untrack(() => samples.value.every(([name]) => metrics.has(name)))) return
      queueMicrotask(() => {
        calibrate()
        prepareAll()
      })
    },
  )
  document.fonts?.addEventListener?.('loadingdone', fontsDone)
  ctx.dials = new MutationObserver(() => {
    calibrate()
    prepareAll()
  })
  ctx.dials.observe(refs.el.ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme', 'data-expression', 'data-density'],
  })
}
