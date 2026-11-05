import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useCustomers, type Customer, type Status } from './store'
import { Button, PageHeader, card, inputClass } from './ui'

const badge: Record<Status, string> = {
  Active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  Trial: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  'Past due': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
}

export function Customers() {
  const customers = useCustomers((s) => s.customers)
  const remove = useCustomers((s) => s.remove)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<Customer | null>(null)

  const q = query.trim().toLowerCase()
  const rows = customers.filter((c) => c.name.toLowerCase().includes(q))

  return (
    <>
      <PageHeader title="Customers">
        Everyone on a Northwind plan, and where their account stands.
      </PageHeader>
      <div className="mb-4 max-w-sm">
        <label htmlFor="search" className="mb-1.5 block text-sm font-medium">
          Search
        </label>
        <input
          id="search"
          type="search"
          className={inputClass}
          placeholder="Search by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className={`${card} overflow-hidden`}>
        {customerTable(rows, setTarget)}
        {rows.length === 0 && (
          <p className="px-4 py-12 text-center text-slate-600 dark:text-slate-400">
            No customers found
          </p>
        )}
      </div>

      <Dialog.Root open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <Dialog.Title className="text-lg font-semibold">Delete customer?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {target?.name} will be removed from your customer list. This can’t be undone.
            </Dialog.Description>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <Button variant="secondary">Keep</Button>
              </Dialog.Close>
              <Button
                variant="danger"
                onClick={() => {
                  if (target) remove(target.id)
                  setTarget(null)
                }}
              >
                Delete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}

function customerTable(rows: Customer[], setTarget: (customer: Customer) => void) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Name
            </th>
            <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">
              Email
            </th>
            <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
              Plan
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3">
                <div className="font-medium">{c.name}</div>
                <div className="text-slate-600 sm:hidden dark:text-slate-400">{c.plan}</div>
              </td>
              <td className="hidden px-4 py-3 text-slate-600 md:table-cell dark:text-slate-400">
                {c.email}
              </td>
              <td className="hidden px-4 py-3 sm:table-cell">{c.plan}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${badge[c.status]}`}
                >
                  {c.status}
                </span>
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  variant="ghost"
                  className="min-h-9 px-3"
                  aria-label={`Delete ${c.name}`}
                  onClick={() => setTarget(c)}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
