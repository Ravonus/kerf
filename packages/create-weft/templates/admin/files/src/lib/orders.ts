export const PAGE_SIZE = 50

export const statuses = ['pending', 'paid', 'shipped', 'refunded'] as const
export type Status = (typeof statuses)[number]

export const sortKeys = ['id', 'customer', 'status', 'total', 'created'] as const
export type SortKey = (typeof sortKeys)[number]
export type Dir = 'asc' | 'desc'

/** What `/admin/orders` is showing. It all lives in the URL, so a view can be reloaded, shared and gone back to. */
export interface OrderView {
  page: number
  sort: SortKey
  dir: Dir
  status: Status | ''
  q: string
}

export const defaultView: OrderView = { page: 1, sort: 'created', dir: 'desc', status: '', q: '' }

export function viewOf(url: string): OrderView {
  const asked = new URL(url).searchParams
  const page = Number(asked.get('page'))
  const sort = sortKeys.find(key => key === asked.get('sort'))
  const status = statuses.find(key => key === asked.get('status'))
  return {
    page: Number.isSafeInteger(page) && page > 0 && page < 1e6 ? page : 1,
    sort: sort ?? defaultView.sort,
    dir: asked.get('dir') === 'asc' ? 'asc' : 'desc',
    status: status ?? '',
    q: (asked.get('q') ?? '').trim().slice(0, 100),
  }
}

export function viewHref(view: OrderView) {
  const query = new URLSearchParams()
  if (view.status) query.set('status', view.status)
  if (view.q) query.set('q', view.q)
  if (view.sort !== defaultView.sort || view.dir !== defaultView.dir) { query.set('sort', view.sort); query.set('dir', view.dir) }
  if (view.page > 1) query.set('page', String(view.page))
  const search = query.toString()
  return search ? `/admin/orders?${search}` : '/admin/orders'
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const wholeDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const day = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

export const money = (cents: number) => dollars.format(cents / 100)
export const roundMoney = (cents: number) => wholeDollars.format(cents / 100)
const number = new Intl.NumberFormat('en-US')
export const count = (n: number) => number.format(n)
export const date = (iso: string) => day.format(new Date(iso))
