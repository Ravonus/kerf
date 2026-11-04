import { createAsync, type RouteDefinition } from '@solidjs/router'
import { For } from 'solid-js'

import { panel, td, th } from '~/components/button'
import { Loads } from '~/components/states'
import { getBiggestCustomers, getTopCities } from '~/lib/data'
import { money } from '~/lib/format'

export const route = {
  preload: () => {
    void getTopCities()
    void getBiggestCustomers()
  },
} satisfies RouteDefinition

export default function NestedPage() {
  return (
    <div class="flex flex-col gap-6">
      <section aria-labelledby="cities" class={`${panel} overflow-hidden`}>
        <h2 id="cities" class="px-4 pt-4 pb-2 font-semibold">
          Cities
        </h2>
        <Loads what="The cities">
          <Cities />
        </Loads>
      </section>
      <section aria-labelledby="biggest">
        <h2 id="biggest" class="mb-3 font-semibold">
          Biggest customers
        </h2>
        <Loads what="Biggest customers">
          <Biggest />
        </Loads>
      </section>
    </div>
  )
}

function Cities() {
  const cities = createAsync(() => getTopCities())
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-line">
          <tr>
            <th scope="col" class={th}>
              City
            </th>
            <th scope="col" class={`${th} text-right`}>
              Orders
            </th>
            <th scope="col" class={`${th} text-right`}>
              Revenue
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <For each={cities()}>
            {(c) => (
              <tr>
                <td class={td}>{c.city}</td>
                <td class={`${td} text-right tabular-nums`}>{c.orders.toLocaleString('en-US')}</td>
                <td class={`${td} text-right tabular-nums`}>{money(c.cents)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function Biggest() {
  const people = createAsync(() => getBiggestCustomers())
  return (
    <ul class="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <For each={people()}>
        {(p) => (
          <li class={`${panel} min-w-0 p-4`}>
            <p class="text-sm text-muted">{p.city}</p>
            <p class="mt-1 truncate font-semibold">{p.name}</p>
            <p class="text-sm text-muted tabular-nums">{money(p.cents)}</p>
          </li>
        )}
      </For>
    </ul>
  )
}
