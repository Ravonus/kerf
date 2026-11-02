import { infiniteScroll, pageList, uid } from '@weft/warp-core'
import { derived, flush, untrack, type State } from 'weft'
import { Button } from './Button'
import { bindable } from './bind'
import { CompactSelect } from './Select'
import { use } from '@weft/warp-core/weft'
import './styles'
import '@weft/warp-core/styles/data/tokens.css'
import '@weft/warp-core/styles/data/base.css'
import '@weft/warp-core/styles/data/pagination.css'
import '@weft/warp-core/styles/data/load-more.css'

export type PaginationBarProps = {
  /** The nav landmark's name; give each bar on a page its own. */
  label?: string
  /** offset (default): numbered pages. cursor: Previous and Next, for a list with no page count. */
  mode?: 'offset' | 'cursor'
  /** 1-based. */
  page?: State<number> | number
  /** The page it opens on when `page` isn't given. */
  defaultPage?: number
  /** Hears the new page (offset) or page index (cursor) on every move. */
  onPageChange?: (page: number) => void
  /** offset: how many rows there are. */
  total?: number
  /** Rows per page: a State to share it, or a number. 25 without it. */
  size?: State<number> | number
  /** The choices in the rows-per-page menu. */
  sizes?: number[]
  /** Hears a new rows-per-page choice; the bar goes back to page 1. */
  onSizeChange?: (size: number) => void
  /** cursor: there is a page after this one, so Next is on. */
  hasMore?: boolean
  /** cursor: there is a page before this one, so Previous is on. */
  hasPrev?: boolean
  /** cursor: the 0-based page showing, which `onPageChange` steps from. */
  pageIndex?: number
  /** cursor: how many rows there are in all, when known ("Showing 50 of 1,200"). */
  supply?: number
  /** cursor: how many rows have loaded so far; `(pageIndex + 1) * size` without it. */
  totalFetched?: number
  /** The locale its numbers are written in. en-US without it. */
  locale?: string
}

/**
 * The pagination bar (06 §8; data.html:1893-1913). Offset mode: rows per page, the range, ‹ 1 … 4 5 6 … 100 › and Go to;
 * under 520px of its own width only ‹ current › remain and the range says the rest. Cursor mode: Previous and Next,
 * and how many are showing. A press keeps focus on the current page, whichever button that now is.
 */
export function PaginationBar({ label = 'Pagination', mode = 'offset', page, defaultPage, onPageChange, total = 0, size, sizes = [10, 25, 50, 100], onSizeChange, hasMore, hasPrev, pageIndex = 0, supply, totalFetched, locale }: PaginationBarProps) {
  const at = bindable<number>(() => page, () => defaultPage, 1, () => p => onPageChange?.(p))
  const per = bindable<number>(() => size, () => undefined, 25, () => s => onSizeChange?.(s))
  const pages = derived(() => Math.max(1, Math.ceil(total / per.value)))
  const current = derived(() => Math.min(pages.value, Math.max(1, at.value)))
  const fmt = (n: number) => n.toLocaleString(locale ?? 'en-US')
  let nav: HTMLElement | undefined
  const go = (p: number) => {
    at.set(Math.min(pages.value, Math.max(1, p)))
    flush()
    nav?.querySelector<HTMLElement>('[aria-current="page"]')?.focus()
  }
  const jump = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const box = e.currentTarget as HTMLInputElement
    const n = parseInt(box.value, 10)
    if (n) at.set(Math.min(pages.value, Math.max(1, n)))
    box.value = ''
  }
  if (untrack(() => mode) === 'cursor') {
    return (
      <nav data-scope="pagination" aria-label={label}>
        <span>{`Showing ${fmt(totalFetched ?? (pageIndex + 1) * per.value)}${supply !== undefined ? ` of ${fmt(supply)}` : ''}${hasMore ? ' · more available' : ''}`}</span>
        <span data-part="spacer"></span>
        <ol>
          <li><Button emphasis="outline" tone="neutral" size="sm" disabled={!hasPrev} onClick={() => onPageChange?.(pageIndex - 1)}>Previous</Button></li>
          <li><Button emphasis="outline" tone="neutral" size="sm" disabled={!hasMore} onClick={() => onPageChange?.(pageIndex + 1)}>Next</Button></li>
        </ol>
      </nav>
    )
  }
  const id = uid('pg')
  const first = derived(() => (total ? (current.value - 1) * per.value + 1 : 0))
  // "Go to" and its box are one item, so the bar never wraps between them: the pair moves to the next line together
  return (
    <nav ref={(n: any) => (nav = n)} data-scope="pagination" aria-label={label}>
      <span data-part="field">
        <span aria-hidden="true">Rows per page</span>
        <CompactSelect label="Rows per page" value={String(per.value)} options={sizes.map(s => ({ value: String(s), label: String(s) }))} onValueChange={v => { per.set(+v); at.set(1) }} />
      </span>
      <span>{`${fmt(first.value)}–${fmt(Math.min(total, current.value * per.value))} of ${fmt(total)}`}</span>
      <span data-part="spacer"></span>
      <ol>
        <li><button type="button" data-part="page" data-edge="" disabled={current.value === 1} aria-label="Previous page" onClick={() => go(current.value - 1)}>‹</button></li>
        {pageList(current.value, pages.value).map((p, i) => <li key={p === 'gap' ? `gap${i}` : p} data-part={p === 'gap' ? 'gap' : undefined} aria-hidden={p === 'gap' ? 'true' : undefined}>{p === 'gap' ? '…' : <button type="button" data-part="page" aria-current={p === current.value ? 'page' : undefined} aria-label={`Page ${p}`} onClick={() => go(p)}>{p}</button>}</li>)}
        <li><button type="button" data-part="page" data-edge="" disabled={current.value === pages.value} aria-label="Next page" onClick={() => go(current.value + 1)}>›</button></li>
      </ol>
      <span data-part="field" data-goto="">
        <label for={`${id}-go`}>Go to<span data-part="sr-only"> page</span></label>
        <input id={`${id}-go`} data-part="jump" inputmode="numeric" placeholder={String(pages.value)} onKeyDown={jump} />
      </span>
    </nav>
  )
}

/**
 * Load more (06 §8): a sentinel watched with a 120px margin, and a button that is always there as the fallback. Set
 * `loading` while a page is on its way (the list shows its skeletons and `aria-busy`); `done` swaps in the end message.
 */
export function LoadMore({ onLoad, loading, done, message, auto = true, root }: { onLoad: () => void; loading?: boolean; done?: boolean; message?: any; auto?: boolean; root?: () => HTMLElement | null }) {
  let el: HTMLDivElement | undefined
  const reach = () => { if (auto && !loading && !done) onLoad() }
  use(infiniteScroll, () => el, () => ({ onReach: reach, root: root?.() }))
  return (
    <div ref={(n: any) => (el = n)} data-scope="load-more">
      <span aria-live="polite">{loading ? 'Loading…' : message}</span>
      {!done && <Button emphasis="outline" tone="neutral" disabled={!!loading} onClick={onLoad}>Load more</Button>}
    </div>
  )
}
