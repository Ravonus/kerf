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
import type { tableModel } from './Table-model'

type Model<T> = ReturnType<typeof tableModel<T>>

/** Render the table under the caller's owner. */
export function tableView<T>(m: Model<T>) {
  const { input, refs, base, source, selection, details, paging, toolbar } = m
  const { id, sel, hidden, shape, sheet } = base
  return (
    <div
      ref={(n) => (refs.el = n)}
      data-scope="table"
      data-phone={shape.value}
      data-state={source.phase.value}
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
      {toolbar.value && tableToolbar(m)}
      {sel && tableBulk({ chosen: selection.chosen, write: selection.write, props: input })}
      {shape.value === 'cards' && selection.sortChoices.value.length > 0 && tableSortbar(m)}
      <div
        data-part="viewport"
        tabindex="0"
        role="region"
        aria-labelledby={`${id}-cap`}
        style={input.maxHeight ? `--warp-table-max-h:${input.maxHeight}` : undefined}
      >
        <table
          role="table"
          aria-labelledby={`${id}-cap`}
          aria-rowcount={source.shown.value.length + 1}
        >
          <caption id={`${id}-cap`} data-part={input.captionHidden ? 'sr-only' : undefined}>
            {input.caption}
          </caption>
          <thead>
            <tr role="row">
              {sel && (
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
              {tableHead(m)}
            </tr>
          </thead>
          <tbody aria-busy={source.phase.value === 'loading' ? 'true' : undefined}>
            {tableBody(m)}
          </tbody>
        </table>
      </div>
      {paging.footer.value && tableFooter(paging)}
      {sheet.value && (
        <Sheet row={sheet.value.row} ctx={details.ctx} onClose={details.closeSheet} />
      )}
    </div>
  )
}
