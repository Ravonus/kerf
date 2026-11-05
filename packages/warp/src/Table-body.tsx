// The table's loading, row and empty-state body.
import type { State } from '@weft-js/core'
import { Button } from './Button'
import { Row } from './Table-rows'
import type { Column, Ctx, TableStatus } from './Table-types'

const SKELETON_ROWS = 6

/** Render the current table body under the table's owner. */
export function tableBody<T>(c: {
  phase: { readonly value: TableStatus }
  sel: State<Record<string, boolean>> | undefined
  hasDetails: boolean
  cols: { readonly value: Column<T>[] }
  visible: { readonly value: readonly T[] }
  keyOf: (row: T) => string
  ctx: Ctx<T>
  level: number
  noticeTitle: { readonly value: unknown }
  noticeText: { readonly value: unknown }
  retry: () => void
  typed: State<string>
  clear: () => string
  emptyAction: () => unknown
}) {
  return (
    <tbody aria-busy={c.phase.value === 'loading' ? 'true' : undefined}>
      {c.phase.value === 'loading' ? (
        Array.from({ length: SKELETON_ROWS }, (_, n) => n).map((n) => (
          <tr key={n} role="row">
            {c.sel && <td role="cell" data-part="select"></td>}
            {c.hasDetails && <td role="cell"></td>}
            {c.cols.value.map((col) => (
              <td key={col.id} role="cell" data-col={col.id} data-priority={col.priority}>
                <span
                  data-part="skeleton"
                  style={`--w:${30 + ((n * 17 + col.id.length * 9) % 55)}%`}
                ></span>
              </td>
            ))}
          </tr>
        ))
      ) : c.phase.value === 'ready' ? (
        c.visible.value.map((r) => <Row key={c.keyOf(r)} row={r} ctx={c.ctx} />)
      ) : (
        <tr role="row">
          <td role="cell" colspan={c.ctx.span()} style="white-space:normal;block-size:auto">
            <div
              data-part="state"
              data-kind={c.phase.value}
              role={c.phase.value === 'error' ? 'alert' : 'status'}
            >
              <svg viewBox="0 0 72 40" aria-hidden="true">
                <line x1="8" y1="0" x2="8" y2="40" />
                <line x1="22" y1="0" x2="22" y2="40" />
                <line x1="36" y1="0" x2="36" y2="40" />
                <line x1="50" y1="0" x2="50" y2="40" />
                <line x1="64" y1="0" x2="64" y2="40" />
                <path d={c.phase.value === 'error' ? 'M0 20H30' : 'M0 14H72M0 26H72'} />
              </svg>
              <h4 aria-level={c.level}>{c.noticeTitle.value}</h4>
              <p>{c.noticeText.value}</p>
              {c.phase.value === 'error' ? (
                <Button emphasis="outline" tone="neutral" onClick={c.retry}>
                  Retry
                </Button>
              ) : c.typed.value ? (
                <Button emphasis="outline" tone="neutral" onClick={c.clear}>
                  Clear filter
                </Button>
              ) : (
                c.emptyAction()
              )}
            </div>
          </td>
        </tr>
      )}
    </tbody>
  )
}
