import { Boundary, resource } from '@kerf/core'
import type { RouteProps } from '@kerf/start'
import { later } from '../db'

// `title` is awaited (meta reads it); `reviews` and `stock` are deferred: they stream into their Boundaries.
const gates = new Map<string, { stock: () => void; reviews: () => void }>()

export const load = async ({ request }: { request: Request }) => {
  const params = new URL(request.url).searchParams
  const token = params.get('sync')
  const release = params.get('release')
  if (token && release) {
    const gate = gates.get(token)
    if (release === 'stock') gate?.stock()
    if (release === 'reviews') {
      gate?.reviews()
      gates.delete(token)
    }
  }
  if (token && !release) {
    let stock!: () => void
    let reviews!: () => void
    const stockReady = new Promise<void>((resolve) => {
      stock = resolve
    })
    const reviewsReady = new Promise<void>((resolve) => {
      reviews = resolve
    })
    gates.set(token, { stock, reviews })
    return {
      title: 'Slow page',
      reviews: reviewsReady.then(() => ['Great', 'Fine']),
      stock: stockReady.then(() => 7),
    }
  }
  return {
    title: await later(5, 'Slow page'),
    reviews: later(60, ['Great', 'Fine']),
    stock: later(20, 7),
  }
}

export const meta = ({ data }: { data: { title: string } }) => ({ title: data.title })

function Reviews(props: { list: Promise<string[]> }) {
  const r = resource(() => props.list)
  return (
    <ul class="reviews">
      {(r.value ?? []).map((t) => (
        <li>{t}</li>
      ))}
    </ul>
  )
}

function Stock(props: { n: Promise<number> }) {
  const r = resource(() => props.n)
  return <p class="stock">In stock: {r.value}</p>
}

export default function Slow(props: RouteProps<typeof load>) {
  return (
    <main>
      <h1>{props.data.title}</h1>
      <Boundary pending={<p class="skeleton">Loading reviews</p>}>
        <Reviews list={props.data.reviews} />
      </Boundary>
      <Boundary pending={<p class="skeleton">Loading stock</p>}>
        <Stock n={props.data.stock} />
      </Boundary>
    </main>
  )
}
