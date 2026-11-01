import { Title } from "@solidjs/meta";
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { createSignal, For } from "solid-js";

import { panel, primary, td, th } from "~/components/button";
import { Loads, Rows } from "~/components/states";
import { StatusBadge } from "~/components/status-badge";
import { getReport } from "~/lib/data";
import { money } from "~/lib/format";

export const route = { preload: () => void getReport() } satisfies RouteDefinition;

export default function Slow() {
  const [count, setCount] = createSignal(0);
  return (
    <>
      <Title>Year report · Backroom</Title>
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-2xl font-semibold tracking-tight">Year report</h1>
        <div class="flex items-center gap-3">
          <p role="status" class="text-sm text-muted tabular-nums">{`Count: ${count()}`}</p>
          <button type="button" class={primary} onClick={() => setCount((n) => n + 1)}>
            Count
          </button>
        </div>
      </header>
      <section aria-label="Report" class="mt-6">
        <Loads what="The report" fallback={<Rows count={6} label="Building the report" />}>
          <Report />
        </Loads>
      </section>
    </>
  );
}

function Report() {
  const report = createAsync(() => getReport());
  return (
    <div class={`${panel} overflow-x-auto`}>
      <table class="w-full text-sm">
        <thead class="border-b border-line">
          <tr>
            <th scope="col" class={th}>Status</th>
            <th scope="col" class={`${th} text-right`}>Orders</th>
            <th scope="col" class={`${th} text-right`}>Revenue</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <For each={report()}>
            {(row) => (
              <tr>
                <td class={td}>
                  <StatusBadge status={row.status} />
                </td>
                <td class={`${td} text-right tabular-nums`}>{row.orders.toLocaleString("en-US")}</td>
                <td class={`${td} text-right tabular-nums`}>{money(row.cents)}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
