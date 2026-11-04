import { Title } from '@solidjs/meta'
import { createAsync, type RouteDefinition, type RouteSectionProps } from '@solidjs/router'

import { Loads } from '~/components/states'
import { getReach } from '~/lib/data'

export const route = { preload: () => void getReach() } satisfies RouteDefinition

export default function NestedSection(props: RouteSectionProps) {
  return (
    <>
      <Title>Regions · Backroom</Title>
      <h1 class="text-2xl font-semibold tracking-tight">Regions</h1>
      <Loads what="The summary" fallback={<p class="mt-1 h-5" />}>
        <Reach />
      </Loads>
      <div class="mt-6">{props.children}</div>
    </>
  )
}

function Reach() {
  const reach = createAsync(() => getReach())
  return (
    <p class="mt-1 text-sm text-muted">
      {reach()?.customers.toLocaleString('en-US')} customers across{' '}
      {reach()?.cities.toLocaleString('en-US')} cities.
    </p>
  )
}
