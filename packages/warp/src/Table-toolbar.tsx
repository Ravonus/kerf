// The table's filter and column chooser toolbar.
import { ColumnsIcon } from '@weft-js/warp-icons'
import { Button } from './Button'
import { Search } from './Field'
import { ColumnsPanel } from './Table-columns'
import type { TableModel } from './Table-model'

/** The column chooser icon. */
export const columnsIcon = () => <ColumnsIcon />
/** Render the toolbar in the table's existing owner. */
export function tableToolbar<T>(
  input: TableModel<T>['input'],
  refs: TableModel<T>['refs'],
  base: TableModel<T>['base'],
  paging: TableModel<T>['paging'],
  hideable: TableModel<T>['hideable'],
  flip: TableModel<T>['flip'],
) {
  const { typed, picking, picked, id, hidden } = base
  return (
    <div data-part="toolbar">
      {input.filter !== undefined && (
        <Search
          label={input.filter}
          value={typed.value}
          onInput={(e: Event) => (typed.value = (e.currentTarget as HTMLInputElement).value)}
        />
      )}
      <span data-part="count" aria-live="polite">
        {paging.count.value}
      </span>
      <span data-part="spacer"></span>
      {input.actions}
      {(input.picker === undefined ? true : input.picker) && (
        <div>
          <Button
            emphasis="outline"
            tone="neutral"
            ref={(n) => (refs.columnsButton = n)}
            aria-expanded={picking.value ? 'true' : 'false'}
            aria-controls={picked.value ? `${id}-cols` : undefined}
            onClick={() => {
              picked.value = true
              picking.value = !picking.value
            }}
          >
            {columnsIcon()}Columns
          </Button>
          {picked.value && (
            <ColumnsPanel
              id={`${id}-cols`}
              open={picking}
              trigger={() => refs.columnsButton!}
              items={hideable.value}
              shown={(c) => !hidden.value.includes(c.id)}
              flip={flip}
            />
          )}
        </div>
      )}
    </div>
  )
}
