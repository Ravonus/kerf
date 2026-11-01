import { derived, state } from 'weft'
import { Badge, Button, Card, Input, Switch } from '@weft/warp'

const products = [
  { id: 1, name: 'Coffee', price: 12, count: state(0) },
  { id: 2, name: 'Filters', price: 5, count: state(0) },
  { id: 3, name: 'Grinder', price: 40, count: state(0) },
]

export default function Shop() {
  const search = state('')
  const ordered = state(false)
  const shown = derived(() => products.filter(p => p.name.toLowerCase().includes(search.value.toLowerCase())))
  const total = derived(() => products.reduce((sum, p) => sum + p.count.value * p.price, 0))
  const shipping = derived(() => (total.value >= 36 ? 0 : 4))
  const order = (e: Event) => {
    e.preventDefault()
    ordered.value = true
  }
  return (
    <Card title="Shop">
      <Input label="Search" value={search.value} onInput={(e: any) => (search.value = e.currentTarget.value)} />
      {shown.value.map(p => (
        <p key={p.id}>
          <Button size="sm" onClick={() => p.count.value++}>{p.name}, ${p.price}</Button>
          <Badge count>{p.count.value}</Badge>
        </p>
      ))}
      <p>Shipping ${shipping.value}</p>
      <p><strong>Total ${total.value + shipping.value}</strong></p>
      <form onSubmit={order}>
        <Input label="Email for the receipt" type="email" />
        <Switch defaultChecked>Gift wrap</Switch>
        <Button type="submit">{ordered.value ? 'Order placed' : 'Place order'}</Button>
      </form>
    </Card>
  )
}
