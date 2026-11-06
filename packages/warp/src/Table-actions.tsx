// Bulk actions and page navigation in a table.
import type { TableProps } from './Table-types'
import type { tablePaging } from './Table-paging'
import { Button } from './Button'

/** Render actions for the current selection. */
export function tableBulk(
  chosen: () => string[],
  write: (next: Record<string, boolean>) => void,
  props: Pick<TableProps<unknown>, 'bulk'>,
) {
  return (
    <div data-part="bulk" hidden={chosen().length === 0} role="region" aria-label="Bulk actions">
      <b>{chosen().length} selected</b>
      {props.bulk?.(chosen())}
      <Button emphasis="ghost" onClick={() => write({})}>
        Clear
      </Button>
    </div>
  )
}

/** Render the table's page navigation. */
export function tableFooter(paging: ReturnType<typeof tablePaging>) {
  const [go, hasPrev, hasNext, range] = paging
  return (
    <div data-part="footer">
      <span>{range.value}</span>
      <div style="display:flex;gap:8px">
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          disabled={!hasPrev.value}
          onClick={() => go('prev')}
        >
          Previous
        </Button>
        <Button
          emphasis="outline"
          tone="neutral"
          size="sm"
          disabled={!hasNext.value}
          onClick={() => go('next')}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
