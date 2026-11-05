// The table's column visibility panel.
import { popover } from '@weft-js/warp-core'
import type { State } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import { Checkbox } from './Choice'
import type { Column } from './Table-types'

/** A disclosure for choosing visible columns. */
export function ColumnsPanel<T>({
  id,
  open,
  trigger,
  items,
  shown,
  flip,
}: {
  id: string
  open: State<boolean>
  trigger: () => HTMLElement
  items: Column<T>[]
  shown: (c: Column<T>) => boolean
  flip: (c: Column<T>, shown: boolean) => void
}) {
  let panel: HTMLDivElement | undefined
  use(
    popover,
    () => panel,
    () => ({
      open: open.value,
      trigger: trigger(),
      side: 'bottom' as const,
      align: 'end' as const,
      onClose: () => (open.value = false),
    }),
  )
  return (
    <div
      ref={(n) => (panel = n)}
      data-scope="popover"
      data-part="content"
      popover="manual"
      id={id}
      role="group"
      aria-label="Visible columns"
    >
      {items.map((c) => (
        <div key={c.id}>
          <Checkbox
            checked={shown(c)}
            onChange={(e: Event) => flip(c, (e.currentTarget as HTMLInputElement).checked)}
          >
            {c.header}
          </Checkbox>
        </div>
      ))}
    </div>
  )
}
