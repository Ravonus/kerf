import type { Meta } from '@kerf/start'
import { Button, Heading, Skeleton, Stack, Table, Text, type Column } from '@kerf/veneer'
import { Boundary, derived, state } from '@kerf/core'
import { Failed } from '#/components/Failed'
import { StatusBadge } from '#/components/StatusBadge'
import { count, money } from '#/lib/orders'
import { yearReport } from '#/server/reports'

export const meta: Meta = { title: 'Year report' }

type Line = { status: string; orders: number; revenue: number }

const columns: Column<Line>[] = [
  {
    id: 'status',
    header: 'Status',
    rowHeader: true,
    cell: (row) => <StatusBadge status={row.status} />,
  },
  { id: 'orders', header: 'Orders', numeric: true, value: (row) => count(row.orders) },
  { id: 'revenue', header: 'Revenue', numeric: true, value: (row) => money(row.revenue) },
]

function Report() {
  const report = yearReport()
  const lines = derived(() => report.value ?? [])
  return (
    <Table
      caption="The year by status"
      captionHidden
      rows={lines}
      columns={columns}
      rowKey="status"
      picker={false}
      empty={{ title: 'Nothing to report', text: 'The report fills in once orders come in.' }}
    />
  )
}

function Tally() {
  const counted = state(0)
  return (
    <div class="section-head">
      <span role="status">Count: {counted.value}</span>
      <Button emphasis="outline" onClick={() => counted.value++}>
        Count
      </Button>
    </div>
  )
}

export default function YearReport() {
  return (
    <Stack gap="group">
      <Stack gap="tight">
        <Heading level={1} role="title">
          Year report
        </Heading>
        <Text subtle>
          The books take a moment to add up. Keep working: the page is yours while they do.
        </Text>
      </Stack>
      <Tally />
      <section aria-label="Report">
        <Boundary
          pending={<Skeleton lines={5} height="1.75rem" aria-label="Adding up the year" />}
          error={(_, retry) => <Failed what="The report" retry={retry} />}
        >
          <Report />
        </Boundary>
      </section>
    </Stack>
  )
}
