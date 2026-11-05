// The table's loading, row and empty-state body.
import { Button } from './Button'
import { Row } from './Table-rows'
import type { tableModel } from './Table-model'

const SKELETON_ROWS = 6

/** Render the current table body under the table's owner. */
export function tableBody<T>(m: ReturnType<typeof tableModel<T>>) {
  const { base, source, details, notice, input } = m
  const { sel, cols, keyOf, level, typed } = base
  return (
    <>
      {source.phase.value === 'loading' ? (
        Array.from({ length: SKELETON_ROWS }, (_, n) => n).map((n) => (
          <tr key={n} role="row">
            {sel && <td role="cell" data-part="select"></td>}
            {details.hasDetails && <td role="cell"></td>}
            {cols.value.map((col) => (
              <td key={col.id} role="cell" data-col={col.id} data-priority={col.priority}>
                <span
                  data-part="skeleton"
                  style={`--w:${30 + ((n * 17 + col.id.length * 9) % 55)}%`}
                ></span>
              </td>
            ))}
          </tr>
        ))
      ) : source.phase.value === 'ready' ? (
        source.visible.value.map((r) => <Row key={keyOf(r)} row={r} ctx={details.ctx} />)
      ) : (
        <tr role="row">
          <td role="cell" colspan={details.ctx.span()} style="white-space:normal;block-size:auto">
            <div
              data-part="state"
              data-kind={source.phase.value}
              role={source.phase.value === 'error' ? 'alert' : 'status'}
            >
              <svg viewBox="0 0 72 40" aria-hidden="true">
                <line x1="8" y1="0" x2="8" y2="40" />
                <line x1="22" y1="0" x2="22" y2="40" />
                <line x1="36" y1="0" x2="36" y2="40" />
                <line x1="50" y1="0" x2="50" y2="40" />
                <line x1="64" y1="0" x2="64" y2="40" />
                <path d={source.phase.value === 'error' ? 'M0 20H30' : 'M0 14H72M0 26H72'} />
              </svg>
              <h4 aria-level={level}>{notice.noticeTitle.value}</h4>
              <p>{notice.noticeText.value}</p>
              {source.phase.value === 'error' ? (
                <Button emphasis="outline" tone="neutral" onClick={notice.retry}>
                  Retry
                </Button>
              ) : typed.value ? (
                <Button emphasis="outline" tone="neutral" onClick={notice.clear}>
                  Clear filter
                </Button>
              ) : (
                input.empty?.action
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
