// The phone card sorting controls.
import type { State } from '@weft-js/core'
import type { SortDir } from '@weft-js/warp-core'
import { Button } from './Button'
import { Select } from './Select'
import type { Column, TableSort } from './Table-types'

/** Render the sort controls under the table's owner. */
export function tableSortbar<T>(ctx: {
  order: State<TableSort | undefined>
  cols: { readonly value: Column<T>[] }
  sortChoices: { readonly value: Column<T>[] }
  askSort: (column: Column<T>, dir?: SortDir) => void
}) {
  return (
    <div data-part="sortbar">
      <Select
        label="Sort by"
        size="sm"
        value={ctx.order.value?.id ?? ''}
        placeholder="None"
        options={ctx.sortChoices.value.map((c) => ({ value: c.id, label: c.header }))}
        onChange={(e: Event) => {
          const c = ctx.cols.value.find((x) => x.id === (e.currentTarget as HTMLInputElement).value)
          if (c) ctx.askSort(c, ctx.order.value?.dir ?? 'ascending')
        }}
      />
      <Button
        emphasis="outline"
        tone="neutral"
        size="sm"
        aria-label="Toggle sort direction"
        disabled={!ctx.order.value}
        onClick={() => {
          const c = ctx.cols.value.find((x) => x.id === ctx.order.value?.id)
          if (c) ctx.askSort(c, ctx.order.value!.dir === 'ascending' ? 'descending' : 'ascending')
        }}
      >
        {ctx.order.value?.dir === 'ascending' ? '↑' : '↓'}
      </Button>
    </div>
  )
}
