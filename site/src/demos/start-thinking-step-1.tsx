import { derived } from '@kerf-js/core'
import { Card, Checkbox, Input } from '@kerf-js/veneer'

type Product = {
  category: string
  price: string
  stocked: boolean
  name: string
}

const PRODUCTS: Product[] = [
  {
    category: 'Beans',
    price: '$12',
    stocked: true,
    name: 'House blend',
  },
  {
    category: 'Beans',
    price: '$16',
    stocked: false,
    name: 'Ethiopia natural',
  },
  {
    category: 'Beans',
    price: '$14',
    stocked: true,
    name: 'Decaf',
  },
  {
    category: 'Gear',
    price: '$40',
    stocked: true,
    name: 'Hand grinder',
  },
  {
    category: 'Gear',
    price: '$5',
    stocked: false,
    name: 'Paper filters',
  },
  {
    category: 'Gear',
    price: '$35',
    stocked: true,
    name: 'Kettle',
  },
]

function ProductCategoryRow({
  category,
}: {
  category: string
}) {
  return (
    <tr>
      <th colspan="2">{category}</th>
    </tr>
  )
}

function ProductRow({ product }: { product: Product }) {
  return (
    <tr>
      <td
        style={{
          color: product.stocked
            ? undefined
            : 'var(--veneer-color-critical-text)',
        }}
      >
        {product.name}
      </td>
      <td>{product.price}</td>
    </tr>
  )
}

function ProductTable({
  products,
}: {
  products: Product[]
}) {
  const categories = derived(() => [
    ...new Set(products.map((p) => p.category)),
  ])
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Price</th>
        </tr>
      </thead>
      {categories.value.map((c) => (
        <tbody key={c}>
          <ProductCategoryRow category={c} />
          {products
            .filter((p) => p.category === c)
            .map((p) => (
              <ProductRow
                key={p.name}
                product={p}
              />
            ))}
        </tbody>
      ))}
    </table>
  )
}

function SearchBar() {
  return (
    <form>
      <Input label="Search" />
      <Checkbox>Only show products in stock</Checkbox>
    </form>
  )
}

export default function FilterableProductTable() {
  return (
    <Card title="Shop stock">
      <SearchBar />
      <ProductTable products={PRODUCTS} />
    </Card>
  )
}
