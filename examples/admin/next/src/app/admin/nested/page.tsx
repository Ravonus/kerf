import type { Metadata } from 'next'
import { Suspense } from 'react'
import { bodyCell, headCell, tableRow } from '@/components/order-cells'
import { panel, Skeleton, TableSkeleton } from '@/components/skeleton'
import { currentUser } from '@/server/auth'
import { loadBiggestCustomers, loadTopCities, money } from '@/server/data'

export const metadata: Metadata = { title: 'Regions' }

async function Cities() {
  await currentUser()
  const cities = await loadTopCities()
  return (
    <div className={`overflow-x-auto ${panel}`}>
      <table className="w-full min-w-[28rem] border-collapse">
        <thead className="bg-tint">
          <tr className="border-b border-line">
            <th scope="col" className={headCell}>
              City
            </th>
            <th scope="col" className={`${headCell} text-right`}>
              Orders
            </th>
            <th scope="col" className={`${headCell} text-right`}>
              Revenue
            </th>
          </tr>
        </thead>
        <tbody>
          {cities.map((c) => (
            <tr key={c.city} className={tableRow}>
              <td className={bodyCell}>{c.city}</td>
              <td className={`${bodyCell} text-right tabular-nums`}>
                {c.orders.toLocaleString('en-US')}
              </td>
              <td className={`${bodyCell} text-right tabular-nums`}>{money(c.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function Biggest() {
  await currentUser()
  const people = await loadBiggestCustomers()
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {people.map((p) => (
        <li key={p.id} className={`${panel} min-w-0 p-4`}>
          <p className="text-sm text-muted">{p.city}</p>
          <p className="mt-1 truncate font-semibold">{p.name}</p>
          <p className="text-sm text-muted tabular-nums">{money(p.revenue)}</p>
        </li>
      ))}
    </ul>
  )
}

export default function Nested() {
  return (
    <>
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Cities />
      </Suspense>
      <section aria-labelledby="biggest">
        <h2 id="biggest" className="mb-3 font-semibold">
          Biggest customers
        </h2>
        <Suspense fallback={<Skeleton className="h-28" />}>
          <Biggest />
        </Suspense>
      </section>
    </>
  )
}
