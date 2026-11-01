import { createAsync, type RouteDefinition } from "@solidjs/router";
import { For } from "solid-js";

import { panel, td, th } from "~/components/button";
import { Loads } from "~/components/states";
import { getTopCustomers } from "~/lib/data";
import { money } from "~/lib/format";

export const route = { preload: () => void getTopCustomers() } satisfies RouteDefinition;

export default function NestedPage() {
  return (
    <section aria-labelledby="top" class={`${panel} overflow-hidden`}>
      <h2 id="top" class="px-4 pt-4 pb-2 font-semibold">
        Top customers
      </h2>
      <Loads what="Top customers">
        <TopCustomers />
      </Loads>
    </section>
  );
}

function TopCustomers() {
  const customers = createAsync(() => getTopCustomers());
  return (
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-line">
          <tr>
            <th scope="col" class={th}>Customer</th>
            <th scope="col" class={th}>City</th>
            <th scope="col" class={`${th} text-right`}>Orders</th>
            <th scope="col" class={`${th} text-right`}>Spent</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <For each={customers()}>
            {(c) => (
              <tr>
                <td class={td}>{c.name}</td>
                <td class={`${td} text-muted`}>{c.city}</td>
                <td class={`${td} text-right tabular-nums`}>{c.orders}</td>
                <td class={`${td} text-right tabular-nums`}>{money(c.cents)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
