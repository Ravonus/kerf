// Render a table from its per-instance model.
import { untrack } from '@weft-js/core'
import { hideRule } from '@weft-js/warp-core'
import { Sheet } from './Table-rows'
import { Checkbox } from './Choice'
import { tableHead } from './Table-head'
import { tableBody } from './Table-body'
import { tableToolbar } from './Table-toolbar'
import { tableSortbar } from './Table-sortbar'
import { tableBulk, tableFooter } from './Table-actions'
import type { TableRender } from './Table-model'

/** Render the table under the caller's owner. */
export const tableView: TableRender = (
  input,
  refs,
  base,
  source,
  selection,
  details,
  paging,
  notice,
  toolbar,
  hideable,
  flip,
) => (
  <div
    ref={(n) => (refs.el = n)}
    data-scope="table"
    data-phone={base.shape.value}
    data-state={source.phase.value}
    data-density={input.density}
    id={base.id}
  >
    {untrack(() => base.hidden.value.length > 0) && (
      <style
        data-part="hide"
        // oxlint-disable-next-line weft/no-html-sink -- hideRule builds a CSS rule from escaped column ids, no markup
        innerHTML={untrack(() => hideRule(base.id, base.hidden.value))}
      ></style>
    )}
    {toolbar.value && tableToolbar(input, refs, base, paging, hideable, flip)}
    {base.sel && tableBulk(selection.chosen, selection.write, input)}
    {base.shape.value === 'cards' &&
      selection.sortChoices.value.length > 0 &&
      tableSortbar(base, selection)}
    <div
      data-part="viewport"
      tabindex="0"
      role="region"
      aria-labelledby={`${base.id}-cap`}
      style={input.maxHeight ? `--warp-table-max-h:${input.maxHeight}` : undefined}
    >
      <table
        role="table"
        aria-labelledby={`${base.id}-cap`}
        aria-rowcount={source.shown.value.length + 1}
      >
        <caption id={`${base.id}-cap`} data-part={input.captionHidden ? 'sr-only' : undefined}>
          {input.caption}
        </caption>
        <thead>
          <tr role="row">
            {base.sel && (
              <th role="columnheader" scope="col" data-part="select" data-pinned="first">
                <Checkbox
                  checked={selection.headerCheck.value === 'all'}
                  indeterminate={selection.headerCheck.value === 'some'}
                  aria-label="Select all rows on this page"
                  onClick={selection.pickAll}
                />
              </th>
            )}
            {details.hasDetails && (
              <th role="columnheader" scope="col" style="inline-size:1px;padding-inline:4px">
                <span data-part="sr-only">Details</span>
              </th>
            )}
            {tableHead(base, selection)}
          </tr>
        </thead>
        <tbody aria-busy={source.phase.value === 'loading' ? 'true' : undefined}>
          {tableBody(input, base, source, details, notice)}
        </tbody>
      </table>
    </div>
    {paging.footer.value && tableFooter(paging)}
    {base.sheet.value && (
      <Sheet row={base.sheet.value.row} ctx={details.ctx} onClose={details.closeSheet} />
    )}
  </div>
)
