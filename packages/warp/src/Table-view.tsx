// Render a table from its per-instance model.
import { untrack } from '@weft-js/core'
import { hideRule } from '@weft-js/warp-core'
import { Sheet } from './Table-rows'
import { tableHead } from './Table-head'
import { tableBody } from './Table-body'
import { tableToolbar } from './Table-toolbar'
import { tableSortbar } from './Table-sortbar'
import { tableBulk, tableFooter } from './Table-actions'
import type { tableModel } from './Table-model'

type Model<T> = ReturnType<typeof tableModel<T>>

/** Render the table under the caller's owner. */
export function tableView<T>(m: Model<T>) {
  const { input, refs, base, source, selection, details, paging, toolbar, hideable, flip } = m
  const { id, typed, sel, hidden, picking, picked, shape, sheet } = base
  return (
    <div
      ref={(n) => (refs.el = n)}
      data-scope="table"
      data-phone={shape.value}
      data-state={source.phase.value}
      data-density={input.density()}
      id={id}
    >
      {untrack(() => hidden.value.length > 0) && (
        <style
          data-part="hide"
          // oxlint-disable-next-line weft/no-html-sink -- hideRule builds a CSS rule from escaped column ids, no markup
          innerHTML={untrack(() => hideRule(id, hidden.value))}
        ></style>
      )}
      {toolbar.value &&
        tableToolbar({
          filter: input.filter,
          actions: input.actions,
          picker: () => input.picker()!,
          typed,
          count: paging.count,
          picking,
          picked,
          id,
          hideable,
          hidden,
          flip,
          setTrigger: (n) => (refs.columnsButton = n),
          trigger: () => refs.columnsButton!,
        })}
      {sel && tableBulk({ chosen: selection.chosen, write: selection.write, bulk: input.bulk })}
      {shape.value === 'cards' &&
        selection.sortChoices.value.length > 0 &&
        tableSortbar({
          order: base.order,
          cols: base.cols,
          sortChoices: selection.sortChoices,
          askSort: selection.askSort,
        })}
      {tableViewport(m)}
      {paging.footer.value && tableFooter(paging)}
      {sheet.value && (
        <Sheet row={sheet.value.row} ctx={details.ctx} onClose={details.closeSheet} />
      )}
    </div>
  )
}

function tableViewport<T>(m: Model<T>) {
  const { input, base, source, selection, details, notice } = m
  const { id, sel, cols, order, keyOf, level, typed } = base
  return (
    <div
      data-part="viewport"
      tabindex="0"
      role="region"
      aria-labelledby={`${id}-cap`}
      style={input.maxHeight() ? `--warp-table-max-h:${input.maxHeight()}` : undefined}
    >
      <table
        role="table"
        aria-labelledby={`${id}-cap`}
        aria-rowcount={source.shown.value.length + 1}
      >
        <caption id={`${id}-cap`} data-part={input.captionHidden() ? 'sr-only' : undefined}>
          {input.caption()}
        </caption>
        {tableHead({
          sel,
          headerCheck: selection.headerCheck,
          pickAll: selection.pickAll,
          hasDetails: details.hasDetails,
          cols,
          order,
          askSort: selection.askSort,
        })}
        {tableBody({
          phase: source.phase,
          sel,
          hasDetails: details.hasDetails,
          cols,
          visible: source.visible,
          keyOf,
          ctx: details.ctx,
          level,
          noticeTitle: notice.noticeTitle,
          noticeText: notice.noticeText,
          retry: notice.retry,
          typed,
          clear: notice.clear,
          emptyAction: () => input.empty()?.action,
        })}
      </table>
    </div>
  )
}
