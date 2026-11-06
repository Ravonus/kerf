// The table's loading, row and empty-state body.
import { Button } from './Button'
import { untrack } from '@weft-js/core'
import { For } from '@weft-js/core/dom'
import { tableRow } from './Table-rows'
import type { TableModel } from './Table-model'

const SKELETON_ROWS = 6

/** Render the current table body under the table's owner. */
export function tableBody<T>(
  input: TableModel<T>['input'],
  base: TableModel<T>['base'],
  source: TableModel<T>['source'],
  details: TableModel<T>['details'],
  notice: TableModel<T>['notice'],
) {
  const [, level, cols, keyOf, , , typed, , sel] = base
  const [, , , , , visible, phase] = source
  const [ctx, hasDetails] = details
  const [retry, clear, noticeTitle, noticeText] = notice
  return (
    <>
      {phase.value === 'loading' ? (
        Array.from({ length: SKELETON_ROWS }, (_, n) => n).map((n) => (
          <tr key={n} role="row">
            {sel && <td role="cell" data-part="select"></td>}
            {hasDetails && <td role="cell"></td>}
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
      ) : phase.value === 'ready' ? (
        <For each={visible.value} by={keyOf}>
          {(row) => untrack(() => tableRow(row, () => ctx))}
        </For>
      ) : (
        <tr role="row">
          <td role="cell" colspan={ctx.span()} style="white-space:normal;block-size:auto">
            <div
              data-part="state"
              data-kind={phase.value}
              role={phase.value === 'error' ? 'alert' : 'status'}
            >
              <svg viewBox="0 0 72 40" aria-hidden="true">
                <line x1="8" y1="0" x2="8" y2="40" />
                <line x1="22" y1="0" x2="22" y2="40" />
                <line x1="36" y1="0" x2="36" y2="40" />
                <line x1="50" y1="0" x2="50" y2="40" />
                <line x1="64" y1="0" x2="64" y2="40" />
                <path d={phase.value === 'error' ? 'M0 20H30' : 'M0 14H72M0 26H72'} />
              </svg>
              <h4 aria-level={level}>{noticeTitle.value}</h4>
              <p>{noticeText.value}</p>
              {phase.value === 'error' ? (
                <Button emphasis="outline" tone="neutral" onClick={retry}>
                  Retry
                </Button>
              ) : typed.value ? (
                <Button emphasis="outline" tone="neutral" onClick={clear}>
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
