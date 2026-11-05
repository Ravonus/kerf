// The table's sortable and resizable column headers.
import type { State } from '@weft-js/core'
import type { SortDir } from '@weft-js/warp-core'
import { Checkbox } from './Choice'
import type { Column, TableSort } from './Table-types'

/** The sort direction icon. */
export const sortIcon = () => (
  <svg data-part="sort-icon" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M5 1.5v7M2 5.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" />
  </svg>
)
/** Render the headers in the table's existing owner. */
export function tableHead<T>(ctx: {
  sel: State<Record<string, boolean>> | undefined
  headerCheck: { readonly value: 'none' | 'all' | 'some' }
  pickAll: () => void
  hasDetails: boolean
  cols: { readonly value: Column<T>[] }
  order: State<TableSort | undefined>
  askSort: (column: Column<T>, dir?: SortDir) => void
}) {
  return (
    <thead>
      <tr role="row">
        {ctx.sel && (
          <th role="columnheader" scope="col" data-part="select" data-pinned="first">
            <Checkbox
              checked={ctx.headerCheck.value === 'all'}
              indeterminate={ctx.headerCheck.value === 'some'}
              aria-label="Select all rows on this page"
              onClick={ctx.pickAll}
            />
          </th>
        )}
        {ctx.hasDetails && (
          <th role="columnheader" scope="col" style="inline-size:1px;padding-inline:4px">
            <span data-part="sr-only">Details</span>
          </th>
        )}
        {ctx.cols.value.map((c) => (
          <th
            key={c.id}
            role="columnheader"
            scope="col"
            data-col={c.id}
            data-numeric={c.numeric ? '' : undefined}
            data-priority={c.priority}
            data-pinned={c.pin ? 'last' : undefined}
            aria-sort={ctx.order.value?.id === c.id ? ctx.order.value.dir : undefined}
          >
            {c.sort ? (
              <button type="button" data-part="sort" onClick={() => ctx.askSort(c)}>
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
      </tr>
    </thead>
  )
}
