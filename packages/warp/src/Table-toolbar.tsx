// The table's filter and column chooser toolbar.
import { ColumnsIcon } from '@weft-js/warp-icons'
import type { State } from '@weft-js/core'
import { Button } from './Button'
import { Search } from './Field'
import { ColumnsPanel } from './Table-columns'
import type { Column } from './Table-types'

/** The column chooser icon. */
export const columnsIcon = () => <ColumnsIcon />
/** Render the toolbar in the table's existing owner. */
export function tableToolbar<T>(ctx: {
  filter: () => string | undefined
  actions: () => unknown
  picker: () => boolean
  typed: State<string>
  count: { readonly value: string }
  picking: State<boolean>
  picked: State<boolean>
  id: string
  hideable: { readonly value: Column<T>[] }
  hidden: State<readonly string[]>
  flip: (column: Column<T>, show: boolean) => void
  setTrigger: (node: HTMLElement) => void
  trigger: () => HTMLElement
}) {
  return (
    <div data-part="toolbar">
      {ctx.filter() !== undefined && (
        <Search
          label={ctx.filter()!}
          value={ctx.typed.value}
          onInput={(e: Event) => (ctx.typed.value = (e.currentTarget as HTMLInputElement).value)}
        />
      )}
      <span data-part="count" aria-live="polite">
        {ctx.count.value}
      </span>
      <span data-part="spacer"></span>
      {ctx.actions()}
      {ctx.picker() && (
        <div>
          <Button
            emphasis="outline"
            tone="neutral"
            ref={(n) => ctx.setTrigger(n)}
            aria-expanded={ctx.picking.value ? 'true' : 'false'}
            aria-controls={ctx.picked.value ? `${ctx.id}-cols` : undefined}
            onClick={() => {
              ctx.picked.value = true
              ctx.picking.value = !ctx.picking.value
            }}
          >
            {columnsIcon()}Columns
          </Button>
          {ctx.picked.value && (
            <ColumnsPanel
              id={`${ctx.id}-cols`}
              open={ctx.picking}
              trigger={ctx.trigger}
              items={ctx.hideable.value}
              shown={(c) => !ctx.hidden.value.includes(c.id)}
              flip={ctx.flip}
            />
          )}
        </div>
      )}
    </div>
  )
}
