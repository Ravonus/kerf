import type { Meta } from '@weft-js/start'
import { Heading, Stack, Text } from '@weft-js/warp'
import { Boundary } from '@weft-js/core'
import { Failed } from '#/components/Failed'
import { LatestOrders, LatestOrdersLoading, RevenueChart, RevenueChartLoading, Stats, StatsLoading } from '#/components/Overview'

export const meta: Meta = { title: 'Overview' }

export default function Overview() {
  return (
    <Stack gap="group">
      <Stack gap="tight">
        <Heading level={1} role="title">Overview</Heading>
        <Text subtle>How the shop is doing, all time.</Text>
      </Stack>
      <Boundary pending={<StatsLoading />} error={(_, retry) => <Failed what="The totals" retry={retry} />}>
        <Stats />
      </Boundary>
      <Boundary pending={<RevenueChartLoading />} error={(_, retry) => <Failed what="The chart" retry={retry} />}>
        <RevenueChart />
      </Boundary>
      <Boundary pending={<LatestOrdersLoading />} error={(_, retry) => <Failed what="The latest orders" retry={retry} />}>
        <LatestOrders />
      </Boundary>
    </Stack>
  )
}
