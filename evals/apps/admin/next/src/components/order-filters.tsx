'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { type FormEvent, startTransition } from 'react'
import { ordersHref, parseQuery, statuses } from '@/lib/orders'

export const field = 'h-10 rounded-lg border border-line bg-raised px-3 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/25'

export function OrderFilters() {
  const router = useRouter()
  const current = parseQuery(Object.fromEntries(useSearchParams()))

  // Without JavaScript this is a plain GET. A new search or status starts again at page 1, keeping the sort.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const next = parseQuery({ q: String(form.get('q')), status: String(form.get('status')), sort: current.sort, dir: current.dir })
    startTransition(() => router.push(ordersHref(next)))
  }

  return (
    <form action="/admin/orders" onSubmit={submit} className="flex flex-wrap gap-2">
      {/* key: back and forward change the URL under an uncontrolled field */}
      <input key={current.q} name="q" aria-label="Search" placeholder="Search customers" enterKeyHint="search" defaultValue={current.q} autoComplete="off" className={`${field} w-56 min-w-0 flex-1 sm:flex-none`} />
      <select key={current.status} name="status" aria-label="Status" defaultValue={current.status ?? ''} onChange={e => e.currentTarget.form?.requestSubmit()} className={`${field} capitalize`}>
        <option value="">All statuses</option>
        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <input type="hidden" name="sort" value={current.sort} />
      <input type="hidden" name="dir" value={current.dir} />
    </form>
  )
}

export function FiltersSkeleton() {
  return <div aria-hidden="true" className="flex h-10 gap-2"><div className={`${field} w-56`} /><div className={`${field} w-36`} /></div>
}
