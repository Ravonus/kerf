import { formatSeconds, traceKey, traceRows, traceSummary, type TraceSpan } from '@weft/warp-core'
import { derived, state, untrack } from 'weft'
import '../styles'
import '@weft/warp-core/styles/app/tokens.css'
import '@weft/warp-core/styles/app/base.css'
import '@weft/warp-core/styles/app/trace.css'

/**
 * TraceViewer (07 §1.3): nested spans on a shared time axis, an APG treegrid. One tab stop; ↑/↓, Home/End move, →/←
 * expand, collapse and step in and out, Enter toggles. The line above follows the focused span's time, tokens and cost.
 * Live: pass new `spans`, and rows patch by id.
 */
export function TraceViewer({ spans, label = 'Spans' }: { spans: TraceSpan[]; label?: string }) {
  const shut = state<ReadonlySet<string>>(new Set())
  const rows = derived(() => traceRows(spans, shut.value))
  const at = state<string | undefined>(undefined)
  const stop = derived(() => rows.value.find(r => r.id === at.value) ?? rows.value[0])
  let grid: HTMLElement | undefined
  const toggle = (id: string) => {
    const next = new Set(shut.value)
    if (!next.delete(id)) next.add(id)
    shut.value = next
  }
  const onKey = (e: KeyboardEvent) => {
    const list = rows.value
    const i = list.findIndex(r => r.id === stop.value?.id)
    if (i < 0) return
    const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl'
    const go = traceKey(e.key, list, i, rtl)
    if (!go) return
    e.preventDefault()
    if (go.toggle) toggle(go.toggle)
    if (go.focus) {
      at.value = go.focus
      queueMicrotask(() => grid?.querySelector<HTMLElement>(`[data-id="${untrack(() => at.value)}"]`)?.focus())
    }
  }
  return (
    <div style="display:grid;gap:14px">
      <div style="display:flex;justify-content:space-between;gap:8px">
        <span data-part="eyebrow">{label}</span>
        <small data-numeric="">{stop.value ? traceSummary(stop.value) : ''}</small>
      </div>
      <div ref={(n: any) => (grid = n)} data-scope="trace" role="treegrid" aria-label={label} aria-readonly="true" onKeyDown={onKey}>
        {rows.value.map(r => (
          <div key={r.id} data-id={r.id} role="row" aria-level={r.level} aria-posinset={r.pos} aria-setsize={r.size} aria-expanded={r.branch ? (r.open ? 'true' : 'false') : undefined} aria-label={`${r.name}, ${traceSummary(r)}`} tabindex={r.id === stop.value?.id ? '0' : '-1'} onFocus={() => (at.value = r.id)} onClick={() => r.branch && toggle(r.id)}>
            <span role="gridcell" style={`--_d:${r.level - 1}`}>{r.branch ? (r.open ? '▾ ' : '▸ ') : ''}{r.name}</span>
            <i role="gridcell" style={`--_x:${r.x};--_w:${r.w};--_c:var(--warp-color-data-${r.color})`}></i>
            <em role="gridcell" data-numeric="">{formatSeconds(r.ms)}</em>
          </div>
        ))}
      </div>
    </div>
  )
}
