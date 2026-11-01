import type { RouteProps } from '@weft/start'
import { Heading, Stack, Text } from '@weft/warp'
import { count } from '#/lib/orders'
import { reach } from '#/server/reports'

export const load = async () => ({ reach: await reach.fetch() })

export default function Regions(props: RouteProps<typeof load>) {
  return (
    <Stack gap="group">
      <Stack gap="tight">
        <Heading level={1} role="title">Regions</Heading>
        <Text subtle>{count(props.data.reach.customers)} customers across {count(props.data.reach.cities)} cities.</Text>
      </Stack>
      {props.children}
    </Stack>
  )
}
