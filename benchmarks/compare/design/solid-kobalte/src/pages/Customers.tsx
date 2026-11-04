import { createMemo, createSignal, For, Show } from 'solid-js'
import { Dialog } from '@kobalte/core'
import { Field } from '../ui'

type Status = 'Active' | 'Trial' | 'Past due'
type Customer = { id: number; name: string; email: string; plan: string; status: Status }

const seed: [string, string, string, Status][] = [
  ['Amelia Hartwell', 'amelia@brightlane.example', 'Team', 'Active'],
  ['Marcus Oyelaran', 'marcus@oyelaran.example', 'Starter', 'Trial'],
  ['Priya Raman', 'priya@kestrelhq.example', 'Enterprise', 'Active'],
  ['Tomás Ferreira', 'tomas@ferreira.example', 'Team', 'Past due'],
  ['Hannah Lindqvist', 'hannah@fjordworks.example', 'Starter', 'Active'],
  ['Devon Brooks', 'devon@brooksandco.example', 'Team', 'Trial'],
  ['Yuki Tanaka', 'yuki@harborlight.example', 'Enterprise', 'Active'],
  ['Sofia Marchetti', 'sofia@marchetti.example', 'Starter', 'Past due'],
  ['Liam O’Connell', 'liam@greenfield.example', 'Team', 'Active'],
  ['Zainab Khalid', 'zainab@northpier.example', 'Enterprise', 'Trial'],
  ['Noah Becker', 'noah@beckerlabs.example', 'Starter', 'Active'],
  ['Isabelle Moreau', 'isabelle@moreau.example', 'Team', 'Active'],
]

const badge: Record<Status, string> = {
  Active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  Trial: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  'Past due': 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
}

export default function Customers() {
  const [rows, setRows] = createSignal<Customer[]>(
    seed.map(([name, email, plan, status], id) => ({ id, name, email, plan, status })),
  )
  const [q, setQ] = createSignal('')
  const [target, setTarget] = createSignal<Customer | null>(null)
  const shown = createMemo(() =>
    rows().filter((r) => r.name.toLowerCase().includes(q().trim().toLowerCase())),
  )

  const confirm = () => {
    const t = target()
    if (t) setRows((r) => r.filter((x) => x.id !== t.id))
    setTarget(null)
  }

  return (
    <>
      <header class="mb-8">
        <h1 class="text-3xl font-bold tracking-tight">Customers</h1>
        <p class="mt-2 text-slate-600 dark:text-slate-400">
          Everyone on a Northwind plan, in one place.
        </p>
      </header>
      <div class="mb-4 max-w-sm">
        <Field
          label="Search"
          type="search"
          value={q()}
          onInput={setQ}
          placeholder="Search by name"
        />
      </div>
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[40rem] text-left text-sm">
            <thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
              <tr>
                <th scope="col" class="px-4 py-3 font-semibold">
                  Name
                </th>
                <th scope="col" class="px-4 py-3 font-semibold">
                  Email
                </th>
                <th scope="col" class="px-4 py-3 font-semibold">
                  Plan
                </th>
                <th scope="col" class="px-4 py-3 font-semibold">
                  Status
                </th>
                <th scope="col" class="px-4 py-3">
                  <span class="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
              <For each={shown()}>
                {(c) => (
                  <tr>
                    <td class="px-4 py-3 font-medium">{c.name}</td>
                    <td class="px-4 py-3 text-slate-600 dark:text-slate-400">{c.email}</td>
                    <td class="px-4 py-3">{c.plan}</td>
                    <td class="px-4 py-3">
                      <span
                        class={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge[c.status]}`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label={`Delete ${c.name}`}
                        class="btn btn-secondary !px-3 !py-1.5"
                        onClick={() => setTarget(c)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
        <Show when={shown().length === 0}>
          <p class="px-4 py-12 text-center text-slate-600 dark:text-slate-400">
            No customers found
          </p>
        </Show>
      </div>

      <Dialog.Root open={target() !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay class="fixed inset-0 z-40 bg-slate-950/50" />
          <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Dialog.Content class="card w-full max-w-md p-6 shadow-xl">
              <Dialog.Title class="text-lg font-semibold">Delete this customer?</Dialog.Title>
              <Dialog.Description class="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {target()?.name} will be removed from your customer list. This can’t be undone.
              </Dialog.Description>
              <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" class="btn btn-secondary" onClick={() => setTarget(null)}>
                  Keep
                </button>
                <button type="button" class="btn btn-danger" onClick={confirm}>
                  Delete
                </button>
              </div>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
