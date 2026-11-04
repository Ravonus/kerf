export const statuses = ['pending', 'paid', 'shipped', 'refunded'] as const
export type Status = (typeof statuses)[number]

export const sortKeys = ['id', 'customer', 'status', 'total', 'created'] as const
export type SortKey = (typeof sortKeys)[number]
export type Dir = 'asc' | 'desc'

export const pageSize = 50

export type OrderRow = { id: number; customer: string; status: string; total: string; date: string }

export type OrdersQuery = { page: number; sort: SortKey; dir: Dir; status?: Status; q?: string }

type Raw = Record<string, string | string[] | undefined>

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
const isStatus = (value?: string): value is Status => statuses.includes(value as Status)
const isSort = (value?: string): value is SortKey => sortKeys.includes(value as SortKey)

export function parseQuery(raw: Raw): OrdersQuery {
  const status = one(raw.status),
    sort = one(raw.sort),
    q = one(raw.q)?.trim().slice(0, 100),
    page = Number(one(raw.page))
  return {
    page: Number.isSafeInteger(page) && page > 0 && page < 1e6 ? page : 1,
    sort: isSort(sort) ? sort : 'created',
    dir: one(raw.dir) === 'asc' ? 'asc' : 'desc',
    status: isStatus(status) ? status : undefined,
    q: q || undefined,
  }
}

/** Defaults stay out of the URL, except a sort someone chose. */
export function ordersHref(query: OrdersQuery) {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.status) params.set('status', query.status)
  if (query.sort !== 'created' || query.dir !== 'desc') {
    params.set('sort', query.sort)
    params.set('dir', query.dir)
  }
  if (query.page > 1) params.set('page', String(query.page))
  const search = params.toString()
  return search ? `/admin/orders?${search}` : '/admin/orders'
}
