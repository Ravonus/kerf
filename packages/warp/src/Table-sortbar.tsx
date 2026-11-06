// The phone card sorting controls.
import { Button } from './Button'
import { Select } from './Select'
import type { TableModel } from './Table-model'

/** Render the sort controls under the table's owner. */
export function tableSortbar<T>(
  base: TableModel<T>['base'],
  selection: TableModel<T>['selection'],
) {
  const { order, cols } = base
  const { sortChoices, askSort } = selection
  return (
    <div data-part="sortbar">
      <Select
        label="Sort by"
        size="sm"
        value={order.value?.id ?? ''}
        placeholder="None"
        options={sortChoices.value.map((c) => ({ value: c.id, label: c.header }))}
        onChange={(e: Event) => {
          const c = cols.value.find((x) => x.id === (e.currentTarget as HTMLInputElement).value)
          if (c) askSort(c, order.value?.dir ?? 'ascending')
        }}
      />
      <Button
        emphasis="outline"
        tone="neutral"
        size="sm"
        aria-label="Toggle sort direction"
        disabled={!order.value}
        onClick={() => {
          const c = cols.value.find((x) => x.id === order.value?.id)
          if (c) askSort(c, order.value!.dir === 'ascending' ? 'descending' : 'ascending')
        }}
      >
        {order.value?.dir === 'ascending' ? '↑' : '↓'}
      </Button>
    </div>
  )
}
