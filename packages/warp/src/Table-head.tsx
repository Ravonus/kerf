// Render the table's column header cells.
import type { tableModel } from './Table-model'

/** The sort direction icon. */
export const sortIcon = () => (
  <svg data-part="sort-icon" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M5 1.5v7M2 5.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" />
  </svg>
)

/** Render the current column headings. */
export function tableHead<T>(m: ReturnType<typeof tableModel<T>>) {
  const { cols, order } = m.base
  const { selection } = m
  return (
    <>
      {cols.value.map((c) => (
        <th
          key={c.id}
          role="columnheader"
          scope="col"
          data-col={c.id}
          data-numeric={c.numeric ? '' : undefined}
          data-priority={c.priority}
          data-pinned={c.pin ? 'last' : undefined}
          aria-sort={order.value?.id === c.id ? order.value.dir : undefined}
        >
          {c.sort ? (
            <button type="button" data-part="sort" onClick={() => selection.askSort(c)}>
              {c.header}
              {sortIcon()}
            </button>
          ) : (
            c.header
          )}
          {c.resize && (
            <span
              data-part="resize"
              role="separator"
              aria-orientation="vertical"
              tabindex="0"
              aria-label={`Resize ${c.header} column`}
              aria-valuenow="80"
              aria-valuemin="80"
              aria-valuemax="480"
            ></span>
          )}
        </th>
      ))}
    </>
  )
}
