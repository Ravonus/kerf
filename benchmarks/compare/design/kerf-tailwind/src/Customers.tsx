import { state, derived } from '@kerf-js/core'
import { Button, Card, PageHeader, control } from './ui'

type Status = 'Active' | 'Trial' | 'Past due'
type Customer = { id: number; name: string; email: string; plan: string; status: Status }

const seed: Customer[] = [
  ['Ada Lovelace', 'ada@analytical.example', 'Team', 'Active'],
  ['Grace Hopper', 'grace@cobol.example', 'Enterprise', 'Active'],
  ['Alan Turing', 'alan@bombe.example', 'Starter', 'Trial'],
  ['Katherine Johnson', 'katherine@orbit.example', 'Enterprise', 'Active'],
  ['Linus Berg', 'linus@kernel.example', 'Team', 'Past due'],
  ['Margaret Hamilton', 'margaret@apollo.example', 'Team', 'Active'],
  ['Dennis Ritchie', 'dennis@unix.example', 'Starter', 'Active'],
  ['Radia Perlman', 'radia@spanning.example', 'Enterprise', 'Trial'],
  ['Tim Okafor', 'tim@lagos.example', 'Starter', 'Past due'],
  ['Hedy Lamarr', 'hedy@spread.example', 'Team', 'Active'],
  ['Edsger Dijkstra', 'edsger@paths.example', 'Starter', 'Trial'],
  ['Barbara Liskov', 'barbara@substitute.example', 'Enterprise', 'Active'],
].map(([name, email, plan, status], i) => ({ id: i + 1, name, email, plan, status }) as Customer)

const badge: Record<Status, string> = {
  Active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  Trial: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  'Past due': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
}
const th =
  'px-4 py-3 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400'
const td = 'px-4 py-3 whitespace-nowrap'

function useCustomers() {
  const customers = state<Customer[]>(seed)
  const query = state('')
  const pending = state<Customer | null>(null)
  const visible = derived(() =>
    customers.value.filter((c) => c.name.toLowerCase().includes(query.value.trim().toLowerCase())),
  )

  const confirm = () => {
    const target = pending.value
    if (target) customers.value = customers.value.filter((c) => c.id !== target.id)
    pending.value = null
  }

  return { query, pending, visible, confirm }
}

function customerConfirmation(
  pending: ReturnType<typeof useCustomers>['pending'],
  confirm: () => void,
) {
  return (
    <div class="fixed inset-0 z-20 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Escape') pending.value = null
        }}
      >
        <h2 id="confirm-title" class="text-lg font-semibold">
          Delete this customer?
        </h2>
        <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {pending.value!.name} will be removed from your customer list. This can't be undone.
        </p>
        <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            autofocus
            onClick={() => {
              pending.value = null
            }}
          >
            Keep
          </Button>
          <Button tone="danger" onClick={confirm}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

function customersHead() {
  return (
    <thead class="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
      <tr>
        <th scope="col" class={th}>
          Name
        </th>
        <th scope="col" class={th}>
          Email
        </th>
        <th scope="col" class={th}>
          Plan
        </th>
        <th scope="col" class={th}>
          Status
        </th>
        <th scope="col" class={th}>
          <span class="sr-only">Actions</span>
        </th>
      </tr>
    </thead>
  )
}

export function Customers() {
  const { query, pending, visible, confirm } = useCustomers()

  return (
    <section>
      <PageHeader
        title="Customers"
        blurb="Everyone on a Northwind plan, and where their account stands."
      />
      <div class="mb-4 max-w-sm">
        <label class="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
          Search
          <input
            class={control}
            type="search"
            placeholder="Search by name"
            value={query.value}
            onInput={(e: Event) => {
              query.value = (e.target as HTMLInputElement).value
            }}
          />
        </label>
      </div>
      <Card class="overflow-hidden !p-0">
        {visible.value.length === 0 ? (
          <p class="px-6 py-12 text-center text-slate-600 dark:text-slate-400">
            No customers found
          </p>
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              {customersHead()}
              <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
                {visible.value.map((c) => (
                  <tr key={c.id}>
                    <td class={`${td} font-medium`}>{c.name}</td>
                    <td class={`${td} text-slate-600 dark:text-slate-400`}>{c.email}</td>
                    <td class={td}>{c.plan}</td>
                    <td class={td}>
                      <span
                        class={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge[c.status]}`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td class={`${td} text-right`}>
                      <Button
                        tone="ghost"
                        label={`Delete ${c.name}`}
                        onClick={() => {
                          pending.value = c
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {pending.value && customerConfirmation(pending, confirm)}
    </section>
  )
}
