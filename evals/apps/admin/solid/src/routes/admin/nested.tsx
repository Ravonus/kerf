import { Title } from "@solidjs/meta";
import { createAsync, type RouteDefinition, type RouteSectionProps } from "@solidjs/router";
import { For } from "solid-js";

import { panel } from "~/components/button";
import { Loads } from "~/components/states";
import { StatusBadge } from "~/components/status-badge";
import { getStatusCounts } from "~/lib/data";
import { money } from "~/lib/format";

export const route = { preload: () => void getStatusCounts() } satisfies RouteDefinition;

export default function NestedSection(props: RouteSectionProps) {
  return (
    <>
      <Title>Nested · Harbor</Title>
      <h1 class="text-2xl font-semibold tracking-tight">Orders by status</h1>
      <div class="mt-6">
        <Loads what="The summary">
          <Counts />
        </Loads>
      </div>
      <div class="mt-6">{props.children}</div>
    </>
  );
}

function Counts() {
  const counts = createAsync(() => getStatusCounts());
  return (
    <dl class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <For each={counts()}>
        {(c) => (
          <div class={`${panel} p-4`}>
            <dt>
              <StatusBadge status={c.status} />
            </dt>
            <dd class="mt-2 text-xl font-semibold tabular-nums">{c.n.toLocaleString("en-US")}</dd>
            <dd class="text-sm text-muted tabular-nums">{money(c.cents)}</dd>
          </div>
        )}
      </For>
    </dl>
  );
}
