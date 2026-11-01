import type { Meta, RouteProps } from '@weft/start'
import { Card, Grid, Heading, Stack, Table, Text, type Column } from '@weft/warp'
import { derived } from 'weft'
import { count, money } from '#/lib/orders'
import { biggestCustomers, topCities } from '#/server/reports'

export const load = async () => ({ cities: await topCities.fetch() })

export const meta: Meta = { title: 'Regions' }

type City = { city: string; orders: number; revenue: number }

const columns: Column<City>[] = [
  { id: 'city', header: 'City', rowHeader: true },
  { id: 'orders', header: 'Orders', numeric: true, value: row => count(row.orders) },
  { id: 'revenue', header: 'Revenue', numeric: true, value: row => money(row.revenue) },
]

function BiggestCustomers() {
  const biggest = biggestCustomers()
  const people = derived(() => biggest.value ?? [])
  return (
    <Stack gap="related">
      <Heading level={2}>Biggest customers</Heading>
      {people.value.length > 0
        ? <Grid min="12rem" gap="related">{people.value.map(person => <Card key={person.id} eyebrow={person.city}><Stack gap="tight"><strong>{person.name}</strong><Text subtle>{money(person.revenue)}</Text></Stack></Card>)}</Grid>
        : <Text subtle>Your best customers will show up here once orders come in.</Text>}
    </Stack>
  )
}

export default function RegionTable(props: RouteProps<typeof load>) {
  const rows = derived(() => props.data.cities)
  return (
    <Stack gap="group">
      <Table caption="Cities" rows={rows} columns={columns} rowKey="city" picker={false} empty={{ title: 'No cities yet', text: 'Each city appears with its first order.' }} />
      <BiggestCustomers />
    </Stack>
  )
}
