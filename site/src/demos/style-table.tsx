import { state } from '@weft-js/core'
import { Badge, Table } from '@weft-js/warp'
import type { Column, TableSort } from '@weft-js/warp'

type Bean = { id: string; name: string; origin: string; stock: number; price: number }

const BEANS: Bean[] = [
  { id: 'h', name: 'House blend', origin: 'Brazil', stock: 24, price: 12 },
  { id: 'y', name: 'Yirgacheffe', origin: 'Ethiopia', stock: 3, price: 18 },
  { id: 'a', name: 'Antigua', origin: 'Guatemala', stock: 0, price: 16 },
  { id: 'k', name: 'Kiambu', origin: 'Kenya', stock: 11, price: 19 },
]

const stockBadge = (b: Bean) =>
  b.stock === 0 ? (
    <Badge tone="critical">Sold out</Badge>
  ) : b.stock < 5 ? (
    <Badge tone="caution">{b.stock} left</Badge>
  ) : (
    <Badge tone="positive">{b.stock}</Badge>
  )

const COLUMNS: Column<Bean>[] = [
  { id: 'name', header: 'Coffee', rowHeader: true, sort: true, card: 'title' },
  { id: 'origin', header: 'Origin', sort: true },
  { id: 'stock', header: 'Stock', numeric: true, sort: true, cell: stockBadge },
  { id: 'price', header: 'Price', numeric: true, sort: true, cell: (b) => `$${b.price}` },
]

export default function Beans() {
  const sort = state<TableSort | undefined>({ id: 'name', dir: 'ascending' })
  return (
    <Table
      caption="Coffee in stock"
      rows={BEANS}
      columns={COLUMNS}
      sort={sort}
      picker={false}
      phone="columns"
    />
  )
}
