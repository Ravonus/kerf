import type { Meta } from '@kerf-js/start'
import { Card, Grid, Heading, Skeleton, Stack, Table, Text, type Column } from '@kerf-js/veneer'
import { Boundary, derived } from '@kerf-js/core'
import { Failed } from '#/components/Failed'
import { count, money } from '#/lib/orders'
import { biggestCustomers, topCities } from '#/server/reports'

export const meta: Meta = { title: 'Regions' }

type City = { city: string; orders: number; revenue: number }

const columns: Column<City>[] = [
  { id: 'city', header: 'City', rowHeader: true },
  { id: 'orders', header: 'Orders', numeric: true, value: (row) => count(row.orders) },
  { id: 'revenue', header: 'Revenue', numeric: true, value: (row) => money(row.revenue) },
]

function Cities() {
  const cities = topCities()
  const rows = derived(() => cities.value ?? [])
  return (
    <Table
      caption="Cities"
      rows={rows}
      columns={columns}
      rowKey="city"
      picker={false}
      empty={{ title: 'No cities yet', text: 'Each city appears with its first order.' }}
    />
  )
}

function BiggestCustomers() {
  const biggest = biggestCustomers()
  const people = derived(() => biggest.value ?? [])
  return (
    <div>
      {people.value.length > 0 ? (
        <Grid min="12rem" gap="related">
          {people.value.map((person) => (
            <Card key={person.id} eyebrow={person.city}>
              <Stack gap="tight">
                <strong>{person.name}</strong>
                <Text subtle>{money(person.revenue)}</Text>
              </Stack>
            </Card>
          ))}
        </Grid>
      ) : (
        <Text subtle>Your best customers will show up here once orders come in.</Text>
      )}
    </div>
  )
}

// Each part reads its own data inside a Boundary, so the page's first byte waits for none of them.
export default function RegionTable() {
  return (
    <Stack gap="group">
      <Boundary
        pending={<Skeleton lines={6} height="1.75rem" aria-label="Loading the cities" />}
        error={(_, retry) => <Failed what="The cities" retry={retry} />}
      >
        <Cities />
      </Boundary>
      <Stack gap="related">
        <Heading level={2}>Biggest customers</Heading>
        <Boundary
          pending={<Skeleton height="5.25rem" aria-label="Loading the biggest customers" />}
          error={(_, retry) => <Failed what="The biggest customers" retry={retry} />}
        >
          <BiggestCustomers />
        </Boundary>
      </Stack>
    </Stack>
  )
}
