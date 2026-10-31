import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { Button, inputCls } from './ui'

type Status = 'Active' | 'Trial' | 'Past due'
type Customer = { id: number; name: string; email: string; plan: string; status: Status }

const seed: [string, string, string, Status][] = [
  ['Ava Thompson', 'ava@brightloop.example', 'Team', 'Active'],
  ['Marcus Chen', 'marcus@harborlabs.example', 'Enterprise', 'Active'],
  ['Priya Patel', 'priya@lumenworks.example', 'Starter', 'Trial'],
  ['Liam O’Connor', 'liam@oakandfern.example', 'Team', 'Past due'],
  ['Sofia Rossi', 'sofia@tidewater.example', 'Team', 'Active'],
  ['Noah Kim', 'noah@quillpost.example', 'Starter', 'Trial'],
  ['Hana Sato', 'hana@kitebridge.example', 'Enterprise', 'Active'],
  ['Elena Petrova', 'elena@northpine.example', 'Starter', 'Past due'],
  ['Diego Alvarez', 'diego@solstice.example', 'Team', 'Active'],
  ['Grace Mwangi', 'grace@ridgeline.example', 'Team', 'Trial'],
  ['Oliver Baker', 'oliver@copperfox.example', 'Starter', 'Active'],
  ['Zara Ahmed', 'zara@meridian.example', 'Enterprise', 'Past due'],
]
const initial: Customer[] = seed.map(([name, email, plan, status], id) => ({ id, name, email, plan, status }))

const badge: Record<Status, string> = {
  Active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  Trial: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  'Past due': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
}

export function Customers() {
  const [customers, setCustomers] = useState(initial)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<Customer | null>(null)
  const shown = customers.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Customers</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">Everyone on a Northwind plan, in one place.</p>
      <div className="mt-6 max-w-sm">
        <label htmlFor="search" className="mb-1.5 block text-sm font-medium">Search</label>
        <input
          id="search"
          type="search"
          placeholder="Filter by name"
          className={inputCls}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-600 dark:border-slate-700 dark:text-slate-400">
          No customers found
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-170 text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Email</th>
                <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shown.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{c.email}</td>
                  <td className="px-4 py-3">{c.plan}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" className="min-h-8 px-3 text-red-700 dark:text-red-400" onClick={() => setTarget(c)}>
                      Delete {c.name}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog.Root open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <Dialog.Title className="text-lg font-semibold">Delete this customer?</Dialog.Title>
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
                  setCustomers((cs) => cs.filter((c) => c.id !== target?.id))
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
