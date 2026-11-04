// The v3 shop app (evals/reference-v3) lowered by hand into what the `native` backend would emit.
// app.source.tsx is the TSX an agent writes; every `() =>` below is a live JSX expression from that file.
import { AppTabs, Choice } from './intents'
import { derived, el, list, match, state, type State } from './runtime'

export type Category = 'fruit' | 'bakery' | 'dairy'
export type Product = { id: string; name: string; category: Category; price: number; stock: number }
export type Api = {
  listProducts(): Promise<Product[]>
  subscribePrices(onUpdate: (u: { id: string; price: number }) => void): () => void
}
type Filters = {
  search: string
  category: 'all' | Category
  sort: 'name' | 'price-asc' | 'price-desc'
}
type Cart = Record<string, number>

export const money = (n: number) => `$${n.toFixed(2)}`

export function App({ api }: { api: Api }) {
  const products = state<Product[] | null>(null)
  const cart = state<Cart>({})
  const tab = state<'products' | 'cart'>('products')
  const filters = state<Filters>({ search: '', category: 'all', sort: 'name' })

  api.listProducts().then((list) => {
    products.value = list
  })
  // The immutable-update habit that cost Solid 300 DOM writes in v3: weft's keyed list plus value-deduped
  // bindings make it cost one op.
  api.subscribePrices(({ id, price }) => {
    products.value =
      products.value && products.value.map((p) => (p.id === id ? { ...p, price } : p))
  })

  const count = derived(() => Object.values(cart.value).reduce((a, q) => a + q, 0))
  const change = (id: string, delta: number) => {
    const p = products.value?.find((x) => x.id === id)
    if (!p) return
    const qty = (cart.value[id] ?? 0) + delta
    if (qty > p.stock) return
    const { [id]: _, ...rest } = cart.value
    cart.value = qty <= 0 ? rest : { ...rest, [id]: qty }
  }

  const ready = (fn: () => number) => () =>
    el(
      'Stack',
      { grow: 1 },
      match(() => (products.value ? 'ready' : 'loading'), {
        loading: () => el('Text', { text: 'Loading…' }),
        ready: fn,
      }),
    )

  return AppTabs({
    title: 'Shop',
    tabs: [
      {
        value: 'products',
        text: () => 'Products',
        label: 'Products tab',
        body: ready(() =>
          ProductList({
            products: () => products.value!,
            cart: () => cart.value,
            filters,
            onAdd: (id) => change(id, 1),
          }),
        ),
      },
      {
        value: 'cart',
        text: () => `Cart (${count.value})`,
        label: 'Cart tab',
        body: ready(() =>
          CartView({ products: () => products.value!, cart: () => cart.value, onChange: change }),
        ),
      },
    ],
    current: () => tab.value,
    onTab: (v) => {
      tab.value = v as 'products' | 'cart'
    },
  })
}

function ProductList(props: {
  products: () => Product[]
  cart: () => Cart
  filters: State<Filters>
  onAdd: (id: string) => void
}) {
  const f = props.filters
  const shown = derived(() => {
    const { search, category, sort } = f.value
    const q = search.trim().toLowerCase()
    return props
      .products()
      .filter(
        (p) => (category === 'all' || p.category === category) && p.name.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'price-asc'
            ? a.price - b.price
            : b.price - a.price,
      )
  })
  const set = (patch: Partial<Filters>) => {
    f.value = { ...f.value, ...patch }
  }

  return el(
    'Stack',
    { gap: 'related', grow: 1 },
    el('Input', {
      label: 'Search',
      placeholder: 'Search',
      value: () => f.value.search,
      onInput: (search) => set({ search }),
    }),
    Choice({
      label: 'Category',
      options: (['all', 'fruit', 'bakery', 'dairy'] as const).map((c) => ({ value: c, text: c })),
      selected: () => f.value.category,
      onSelect: (c) => set({ category: c as Filters['category'] }),
    }),
    Choice({
      label: 'Sort',
      options: [
        { value: 'name', text: 'Name' },
        { value: 'price-asc', text: 'Price ↑' },
        { value: 'price-desc', text: 'Price ↓' },
      ],
      selected: () => f.value.sort,
      onSelect: (s) => set({ sort: s as Filters['sort'] }),
    }),
    el('Text', {
      role: 'caption',
      label: 'product-count',
      text: () => (shown.value.length === 1 ? '1 product' : `${shown.value.length} products`),
    }),
    el(
      'Scroll',
      { gap: 'related', grow: 1, label: 'Products' },
      list(
        () => shown.value,
        (p) => p.id,
        (item) =>
          ProductRow({
            product: () => item.value,
            left: () => item.value.stock - (props.cart()[item.value.id] ?? 0),
            onAdd: props.onAdd,
          }),
      ),
    ),
  )
}

function ProductRow(props: {
  product: () => Product
  left: () => number
  onAdd: (id: string) => void
}) {
  return el(
    'Row',
    { gap: 'related', align: 'center' },
    el('Text', { text: () => props.product().name, grow: 1 }),
    el('Text', {
      text: () => money(props.product().price),
      label: () => `${props.product().name} price`,
    }),
    el('Text', {
      role: 'caption',
      text: () =>
        props.left() <= 0 ? 'Out of stock' : props.left() <= 3 ? `Only ${props.left()} left` : '',
    }),
    el('Button', {
      text: 'Add',
      label: () => `Add ${props.product().name}`,
      disabled: () => props.left() <= 0,
      onTap: () => props.onAdd(props.product().id),
    }),
  )
}

function CartView(props: {
  products: () => Product[]
  cart: () => Cart
  onChange: (id: string, delta: number) => void
}) {
  const lines = derived(() => props.products().filter((p) => props.cart()[p.id]))
  const total = derived(() => lines.value.reduce((s, p) => s + p.price * props.cart()[p.id], 0))
  return el(
    'Stack',
    { gap: 'related', grow: 1 },
    el(
      'Scroll',
      { gap: 'related', grow: 1, label: 'Cart' },
      list(
        () => lines.value,
        (p) => p.id,
        (item) =>
          el(
            'Row',
            { gap: 'related', align: 'center' },
            el('Text', {
              text: () => `${item.value.name} × ${props.cart()[item.value.id] ?? 0}`,
              grow: 1,
            }),
            el('Button', {
              text: '−',
              label: () => `Remove one ${item.value.name}`,
              onTap: () => props.onChange(item.value.id, -1),
            }),
            el('Button', {
              text: '+',
              label: () => `Add one ${item.value.name}`,
              onTap: () => props.onChange(item.value.id, 1),
            }),
          ),
      ),
    ),
    el('Text', { role: 'title', label: 'total', text: () => `Total ${money(total.value)}` }),
  )
}

/** 150 products, like the v3 probe. */
export function seedProducts(n = 150): Product[] {
  const names = [
    'Apple',
    'Banana',
    'Bagel',
    'Brioche',
    'Milk',
    'Yogurt',
    'Pear',
    'Rye',
    'Cheese',
    'Plum',
  ]
  const cats: Category[] = [
    'fruit',
    'fruit',
    'bakery',
    'bakery',
    'dairy',
    'dairy',
    'fruit',
    'bakery',
    'dairy',
    'fruit',
  ]
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `${names[i % 10]} ${Math.floor(i / 10) + 1}`,
    category: cats[i % 10],
    price: Math.round((0.25 + ((i * 37) % 100) / 20) * 100) / 100,
    stock: i % 7,
  }))
}
