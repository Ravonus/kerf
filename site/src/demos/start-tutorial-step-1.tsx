import { Card } from '@kerf-js/veneer'

const PRODUCTS = [
  { id: 'beans', name: 'House beans, 250 g', price: 12 },
  { id: 'filters', name: 'Paper filters', price: 5 },
  { id: 'grinder', name: 'Hand grinder', price: 40 },
  { id: 'mug', name: 'Enamel mug', price: 9 },
]

type Product = (typeof PRODUCTS)[number]

function ProductRow({ product }: { product: Product }) {
  return (
    <p>
      {product.name} <strong>${product.price}</strong>
    </p>
  )
}

export default function Shop() {
  return (
    <Card title="The shop">
      {PRODUCTS.map((p) => (
        <ProductRow
          key={p.id}
          product={p}
        />
      ))}
    </Card>
  )
}
