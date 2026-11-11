import { infiniteScroll, pageList, uid } from '@kerf-js/veneer-core'
import { derived, flush, untrack, type State } from '@kerf-js/core'
import { Button } from './Button'
import { bindable } from './bind'
import { CompactSelect } from './Select'
import { use } from '@kerf-js/veneer-core/kerf'
import './styles'
import '@kerf-js/veneer-core/styles/data/tokens.css'
import '@kerf-js/veneer-core/styles/data/base.css'
import '@kerf-js/veneer-core/styles/data/pagination.css'
import '@kerf-js/veneer-core/styles/data/load-more.css'

/** Props for PaginationBar. */
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

type CursorContext = {
  label: () => string
  totalFetched: () => number | undefined
  pageIndex: () => number
  supply: () => number | undefined
  hasMore: () => boolean | undefined
  hasPrev: () => boolean | undefined
  previous: () => void
  next: () => void
  per: { readonly value: number }
  fmt: (n: number) => string
}

function cursorPagination(ctx: CursorContext) {
  return (
    <nav data-scope="pagination" aria-label={ctx.label()}>
      <span>{`Showing ${ctx.fmt(ctx.totalFetched() ?? (ctx.pageIndex() + 1) * ctx.per.value)}${ctx.supply() !== undefined ? ` of ${ctx.fmt(ctx.supply()!)}` : ''}${ctx.hasMore() ? ' · more available' : ''}`}</span>
      <span data-part="spacer"></span>
      <ol>
        <li>
          <Button
            emphasis="outline"
            tone="neutral"
            size="sm"
            disabled={!ctx.hasPrev()}
            onClick={() => ctx.previous()}
          >
            Previous
          </Button>
        </li>
        <li>
          <Button
            emphasis="outline"
            tone="neutral"
            size="sm"
            disabled={!ctx.hasMore()}
            onClick={() => ctx.next()}
          >
            Next
          </Button>
        </li>
      </ol>
    </nav>
  )
}

type OffsetContext = {
  setNav: (el: HTMLElement) => void
  label: () => string
  readonly sizes: number[]
  total: () => number
  per: ReturnType<typeof bindable<number>>
  at: ReturnType<typeof bindable<number>>
  current: { readonly value: number }
  first: { readonly value: number }
  pages: { readonly value: number }
  fmt: (n: number) => string
  go: (n: number) => void
  jump: (e: KeyboardEvent) => void
  id: string
}

function paginationJump(at: OffsetContext['at'], pages: OffsetContext['pages']) {
  return (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const box = e.currentTarget as HTMLInputElement
    const n = parseInt(box.value, 10)
    if (n) at.set(Math.min(pages.value, Math.max(1, n)))
    box.value = ''
  }
}

function paginationSizeChange(ctx: OffsetContext) {
  return (v: string) => {
    ctx.per.set(+v)
    ctx.at.set(1)
  }
}

// "Go to" and its box are one item, so the bar never wraps between them: the pair moves to the next line together
function paginationSizes(ctx: OffsetContext) {
  return {
    get value() {
      return ctx.sizes
    },
  }
}

function offsetPagination(ctx: OffsetContext) {
  const onSizeChange = paginationSizeChange(ctx)
  const sizes = paginationSizes(ctx)
  return (
    <nav ref={(n) => ctx.setNav(n)} data-scope="pagination" aria-label={ctx.label()}>
      <span data-part="field">
        <span aria-hidden="true">
          Rows<span data-part="long"> per page</span>
        </span>
        <CompactSelect
          label="Rows per page"
          value={String(ctx.per.value)}
          options={sizes.value.map((s) => ({ value: String(s), label: String(s) }))}
          onValueChange={onSizeChange}
        />
      </span>
      <span>{`${ctx.fmt(ctx.first.value)}–${ctx.fmt(Math.min(ctx.total(), ctx.current.value * ctx.per.value))} of ${ctx.fmt(ctx.total())}`}</span>
      <span data-part="spacer"></span>
      <ol>
        <li>
          <button
            type="button"
            data-part="page"
            data-edge=""
            disabled={ctx.current.value === 1}
            aria-label="Previous page"
            onClick={() => ctx.go(ctx.current.value - 1)}
          >
            ‹
          </button>
        </li>
        {pageList(ctx.current.value, ctx.pages.value).map((p, i) => (
          <li
            key={p === 'gap' ? `gap${i}` : p}
            data-part={p === 'gap' ? 'gap' : undefined}
            aria-hidden={p === 'gap' ? 'true' : undefined}
          >
            {p === 'gap' ? (
              '…'
            ) : (
              <button
                type="button"
                data-part="page"
                aria-current={p === ctx.current.value ? 'page' : undefined}
                aria-label={`Page ${p}`}
                onClick={() => ctx.go(p)}
              >
                {p}
              </button>
            )}
          </li>
        ))}
        <li>
          <button
            type="button"
            data-part="page"
            data-edge=""
            disabled={ctx.current.value === ctx.pages.value}
            aria-label="Next page"
            onClick={() => ctx.go(ctx.current.value + 1)}
          >
            ›
          </button>
        </li>
      </ol>
      <span data-part="field" data-goto="">
        <label for={`${ctx.id}-go`}>
          Go to<span data-part="sr-only"> page</span>
        </label>
        <input
          id={`${ctx.id}-go`}
          data-part="jump"
          inputmode="numeric"
          placeholder={String(ctx.pages.value)}
          onKeyDown={ctx.jump}
        />
      </span>
    </nav>
  )
}

/**
 * The pagination bar (06 §8; data.html:1893-1913). Offset mode: rows per page, the range, ‹ 1 … 4 5 6 … 100 › and Go to;
 * under 520px of its own width only ‹ current › remain and the range says the rest. Cursor mode: Previous and Next,
 * and how many are showing. A press keeps focus on the current page, whichever button that now is.
 */
export function PaginationBar({
  label = 'Pagination',
  mode = 'offset',
  page,
  defaultPage,
  onPageChange,
  total = 0,
  size,
  sizes = [10, 25, 50, 100],
  onSizeChange,
  hasMore,
  hasPrev,
  pageIndex = 0,
  supply,
  totalFetched,
  locale,
}: PaginationBarProps) {
  const at = bindable<number>(
    () => page,
    () => defaultPage,
    1,
    () => (p) => onPageChange?.(p),
  )
  const per = bindable<number>(
    () => size,
    () => undefined,
    25,
    () => (s) => onSizeChange?.(s),
  )
  const pages = derived(() => Math.max(1, Math.ceil(total / per.value)))
  const current = derived(() => Math.min(pages.value, Math.max(1, at.value)))
  const numbers = derived(() => new Intl.NumberFormat(locale ?? 'en-US'))
  const fmt = (n: number) => numbers.value.format(n)
  let nav: HTMLElement | undefined
  const go = (p: number) => {
    at.set(Math.min(pages.value, Math.max(1, p)))
    flush()
    nav?.querySelector<HTMLElement>('[aria-current="page"]')?.focus()
  }
  const jump = paginationJump(at, pages)
  if (untrack(() => mode) === 'cursor') {
    return cursorPagination({
      label: () => label,
      totalFetched: () => totalFetched,
      pageIndex: () => pageIndex,
      supply: () => supply,
      hasMore: () => hasMore,
      hasPrev: () => hasPrev,
      previous: () => onPageChange?.(pageIndex - 1),
      next: () => onPageChange?.(pageIndex + 1),
      per,
      fmt,
    })
  }
  const id = uid('pg')
  const first = derived(() => (total ? (current.value - 1) * per.value + 1 : 0))
  return offsetPagination({
    setNav: (n) => (nav = n),
    label: () => label,
    get sizes() {
      return sizes
    },
    total: () => total,
    per,
    at,
    current,
    first,
    pages,
    fmt,
    go,
    jump,
    id,
  })
}

/**
 * Load more (06 §8): a sentinel watched with a 120px margin, and a button that is always there as the fallback. Set
 * `loading` while a page is on its way (the list shows its skeletons and `aria-busy`); `done` swaps in the end message.
 */
export function LoadMore({
  onLoad,
  loading,
  done,
  message,
  auto = true,
  root,
}: {
  onLoad: () => void
  loading?: boolean | undefined
  done?: boolean
  message?: unknown
  auto?: boolean
  root?: (() => HTMLElement | null) | undefined
}) {
  let el: HTMLDivElement | undefined
  const reach = () => {
    if (auto && !loading && !done) onLoad()
  }
  use(
    infiniteScroll,
    () => el,
    () => ({ onReach: reach, root: root?.() }),
  )
  return (
    <div ref={(n) => (el = n)} data-scope="load-more">
      <span aria-live="polite">{loading ? 'Loading…' : message}</span>
      {!done && (
        <Button emphasis="outline" tone="neutral" disabled={!!loading} onClick={onLoad}>
          Load more
        </Button>
      )}
    </div>
  )
}
