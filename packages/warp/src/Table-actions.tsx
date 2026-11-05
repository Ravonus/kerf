// Bulk actions and page navigation in a table.
import type { TableProps } from './Table-types'
import { Button } from './Button'

/** Render actions for the current selection. */
export function tableBulk(ctx: {
  chosen: () => string[]
  write: (next: Record<string, boolean>) => void
  props: Pick<TableProps<unknown>, 'bulk'>
}) {
  return (
    <div
      data-part="bulk"
      hidden={ctx.chosen().length === 0}
      role="region"
      aria-label="Bulk actions"
    >
      <b>{ctx.chosen().length} selected</b>
      {ctx.props.bulk?.(ctx.chosen())}
      <Button emphasis="ghost" onClick={() => ctx.write({})}>
        Clear
      </Button>
    </div>
  )
}

/** Render the table's page navigation. */
export function tableFooter(ctx: {
  range: { readonly value: string }
  hasPrev: { readonly value: boolean }
  hasNext: { readonly value: boolean }
  go: (reason: 'next' | 'prev') => void
}) {
  return (
    <div data-part="footer">
      <span>{ctx.range.value}</span>
      <div style="display:flex;gap:8px">
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          disabled={!ctx.hasPrev.value}
          onClick={() => ctx.go('prev')}
        >
          Previous
        </Button>
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          disabled={!ctx.hasNext.value}
          onClick={() => ctx.go('next')}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
