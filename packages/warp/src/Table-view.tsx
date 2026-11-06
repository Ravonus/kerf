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
export const tableView: TableRender = (input, refs, ...parts) => {
  const [base, source, selection, details, paging, notice, toolbar, hideable, flip] = parts
  const [id, , , , , , , , sel, , hidden, , sheet, , , , shape] = base
  const [, , , shown, , , phase] = source
  const [, chosen, write, , headerCheck, pickAll, , sortChoices] = selection
  const [ctx, hasDetails, closeSheet] = details
  const [, , , , , footer] = paging
  return (
    <div
      ref={(n) => (refs.el = n)}
      data-scope="table"
      data-phone={shape.value}
      data-state={phase.value}
      data-density={input.density}
      id={id}
    >
      {untrack(() => hidden.value.length > 0) && (
        <style
          data-part="hide"
          // oxlint-disable-next-line weft/no-html-sink -- hideRule builds a CSS rule from escaped column ids, no markup
          innerHTML={untrack(() => hideRule(id, hidden.value))}
        ></style>
      )}
      {toolbar.value && tableToolbar(input, refs, base, paging, hideable, flip)}
      {sel && tableBulk(chosen, write, input)}
      {shape.value === 'cards' && sortChoices.value.length > 0 && tableSortbar(base, selection)}
      <div
        data-part="viewport"
        tabindex="0"
        role="region"
        aria-labelledby={`${id}-cap`}
        style={input.maxHeight ? `--warp-table-max-h:${input.maxHeight}` : undefined}
      >
        <table role="table" aria-labelledby={`${id}-cap`} aria-rowcount={shown.value.length + 1}>
          <caption id={`${id}-cap`} data-part={input.captionHidden ? 'sr-only' : undefined}>
            {input.caption}
          </caption>
          <thead>
            <tr role="row">
              {sel && (
                <th role="columnheader" scope="col" data-part="select" data-pinned="first">
                  <Checkbox
                    checked={headerCheck.value === 'all'}
                    indeterminate={headerCheck.value === 'some'}
                    aria-label="Select all rows on this page"
                    onClick={pickAll}
                  />
                </th>
              )}
              {hasDetails && (
                <th role="columnheader" scope="col" style="inline-size:1px;padding-inline:4px">
                  <span data-part="sr-only">Details</span>
                </th>
              )}
              {tableHead(base, selection)}
            </tr>
          </thead>
          <tbody aria-busy={phase.value === 'loading' ? 'true' : undefined}>
            {tableBody(input, base, source, details, notice)}
          </tbody>
        </table>
      </div>
      {footer.value && tableFooter(paging)}
      {sheet.value && <Sheet row={sheet.value.row} ctx={ctx} onClose={closeSheet} />}
    </div>
  )
}
