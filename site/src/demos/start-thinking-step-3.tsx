import { derived, state } from '@kerf-js/core'
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
  filterText,
  inStockOnly,
}: {
  products: Product[]
  filterText: string
  inStockOnly: boolean
}) {
  const shown = derived(() => {
    const word = filterText.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(word) &&
        (p.stocked || !inStockOnly),
    )
  })
  const categories = derived(() => [
    ...new Set(shown.value.map((p) => p.category)),
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
          {shown.value
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

function SearchBar(props: {
  filterText?: string
  inStockOnly?: boolean
}) {
  let { filterText = '', inStockOnly = false } = props
  return (
    <form>
      <Input
        label="Search"
        value={filterText}
        onInput={(e) =>
          (filterText = e.currentTarget.value)
        }
      />
      <Checkbox
        checked={inStockOnly}
        onChange={(
          e: Event & { currentTarget: HTMLInputElement },
        ) => (inStockOnly = e.currentTarget.checked)}
      >
        Only show products in stock
      </Checkbox>
    </form>
  )
}

export default function FilterableProductTable() {
  const filterText = state('')
  const inStockOnly = state(true)
  return (
    <Card title="Shop stock">
      <SearchBar
        bind:filterText={filterText}
        bind:inStockOnly={inStockOnly}
      />
      <ProductTable
        products={PRODUCTS}
        filterText={filterText.value}
        inStockOnly={inStockOnly.value}
      />
    </Card>
  )
}
