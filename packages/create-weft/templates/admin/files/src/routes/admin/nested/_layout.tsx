import type { RouteProps } from '@weft-js/start'
import { Heading, Skeleton, Stack, Text } from '@weft-js/warp'
import { Boundary } from '@weft-js/core'
import { Failed } from '#/components/Failed'
import { count } from '#/lib/orders'
import { reach } from '#/server/reports'

function Reach() {
  const store = reach()
  return <Text subtle>{count(store.value?.customers ?? 0)} customers across {count(store.value?.cities ?? 0)} cities.</Text>
}

export default function Regions(props: RouteProps) {
  return (
    <Stack gap="group">
      <Stack gap="tight">
        <Heading level={1} role="title">Regions</Heading>
        <Boundary pending={<Skeleton width="16rem" aria-label="Loading the reach" />} error={(_, retry) => <Failed what="The reach" retry={retry} />}>
          <Reach />
        </Boundary>
      </Stack>
      {props.children}
    </Stack>
  )
}
