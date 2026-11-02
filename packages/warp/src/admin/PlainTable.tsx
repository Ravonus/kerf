import '../styles'
import '@weft-js/warp-core/styles/data/tokens.css'
import '@weft-js/warp-core/styles/data/base.css'
import '@weft-js/warp-core/styles/data/table.css'

/**
 * The look of 06's table for a fixed matrix that isn't a DataTable (a roles matrix, CSV mapping and preview): no sort,
 * no cards. It scrolls inline on a phone (09 §8), and the viewport takes focus so a keyboard can scroll it.
 */
export function PlainTable({ label, scope, caption, head, children }: { label: string; scope: string; caption: string; head: unknown; children: unknown }) {
  return (
    <div data-scope="table" data-phone="columns" data-state="ready">
      <div data-part="viewport" role="region" aria-label={label} tabindex="0">
        <table data-scope={scope}>
          <caption data-part="sr-only">{caption}</caption>
          <thead>{head}</thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  )
}
