import { Title } from "@solidjs/meta";
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { For, Show } from "solid-js";

import { panel, td, th } from "~/components/button";
import { Loads } from "~/components/states";
import { StatusBadge } from "~/components/status-badge";
import { getOverview } from "~/lib/data";
import { compactMoney, formatDay, formatMonth, money } from "~/lib/format";

export const route = { preload: () => void getOverview() } satisfies RouteDefinition;

export default function Overview() {
  return (
    <>
      <Title>Overview · Harbor</Title>
      <h1 class="text-2xl font-semibold tracking-tight">Overview</h1>
      <div class="mt-6">
        <Loads what="The overview">
          <Dashboard />
        </Loads>
      </div>
    </>
  );
}

function Dashboard() {
  const data = createAsync(() => getOverview());
  return (
    <Show when={data()}>
      {(d) => (
        <>
          <dl class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Revenue" value={money(d().stats.revenue)} />
            <Stat label="Orders" value={d().stats.orders.toLocaleString("en-US")} />
            <Stat label="Customers" value={d().stats.customers.toLocaleString("en-US")} />
            <Stat label="Refunded" value={money(d().stats.refunded)} />
          </dl>
          <RevenueChart months={d().months} />
          <section aria-labelledby="latest" class={`${panel} mt-6 overflow-hidden`}>
            <h2 id="latest" class="px-4 pt-4 pb-2 font-semibold">
              Latest orders
            </h2>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="border-b border-line">
                  <tr>
                    <th scope="col" class={th}>Order</th>
                    <th scope="col" class={th}>Customer</th>
                    <th scope="col" class={th}>Status</th>
                    <th scope="col" class={`${th} text-right`}>Total</th>
                    <th scope="col" class={th}>Date</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-line">
                  <For each={d().recent}>
                    {(order) => (
                      <tr>
                        <td class={td}>
                          <a href={`/admin/orders/${order.id}`} class="font-medium text-accent-text hover:underline">
                            #{order.id}
                          </a>
                        </td>
                        <td class={td}>{order.customer}</td>
                        <td class={td}>
                          <StatusBadge status={order.status} />
                        </td>
                        <td class={`${td} text-right tabular-nums`}>{money(order.totalCents)}</td>
                        <td class={`${td} text-muted`}>{formatDay(order.createdAt)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Show>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div class={`${panel} p-4`}>
      <dt class="text-sm text-muted">{props.label}</dt>
      <dd class="mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{props.value}</dd>
    </div>
  );
}

function RevenueChart(props: { months: { month: string; cents: number }[] }) {
  const top = () => Math.max(1, ...props.months.map((m) => m.cents));
  return (
    <figure class={`${panel} mt-6 p-4`}>
      <figcaption class="font-semibold">Revenue by month</figcaption>
      <ol class="mt-4 flex h-52 items-end gap-1.5 sm:gap-3">
        <For each={props.months}>
          {(m) => (
            <li class="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
              <span class="mb-1 truncate text-xs text-muted tabular-nums">{compactMoney(m.cents)}</span>
              <span class="block rounded-t-md bg-accent" style={{ height: `${(m.cents / top()) * 78}%` }} />
              <span class="mt-1.5 text-xs text-muted">{formatMonth(m.month)}</span>
            </li>
          )}
        </For>
      </ol>
    </figure>
  );
}
