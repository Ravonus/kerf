export const PAGE_SIZE = 24
/** Prices are filtered in whole dollars; past this nothing is for sale, and cents still fit the column. */
const MOST = 1_000_000

/** A category page's filters: everything lives in the URL, so a filtered page can be shared and works before hydration. */
export type View = { min: number | null; max: number | null; stock: boolean; page: number }

export const amount = (text: unknown) => {
  const n = typeof text === 'string' && text.trim() ? Number(text) : NaN
  return n >= 0 ? Math.min(Math.floor(n), MOST) : null
}

export function viewOf(url: string): View {
  const q = new URL(url).searchParams
  const page = Number(q.get('page'))
  return { min: amount(q.get('min')), max: amount(q.get('max')), stock: q.has('stock'), page: Number.isInteger(page) && page > 1 ? page : 1 }
}

export function viewHref(slug: string, view: View) {
  const q = new URLSearchParams()
  if (view.min !== null) q.set('min', String(view.min))
  if (view.max !== null) q.set('max', String(view.max))
  if (view.stock) q.set('stock', '1')
  if (view.page > 1) q.set('page', String(view.page))
  const search = q.toString()
  return `/c/${slug}${search ? `?${search}` : ''}`
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const money = (cents: number) => dollars.format(cents / 100)
