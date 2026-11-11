import { Button, Card } from '@kerf-js/veneer'

function OrderButton() {
  return <Button>Order a coffee</Button>
}

export default function Cafe() {
  return (
    <Card title="Welcome to the café">
      <p>Beans roasted on Mondays, ground to order.</p>
      <OrderButton />
      <OrderButton />
    </Card>
  )
}
