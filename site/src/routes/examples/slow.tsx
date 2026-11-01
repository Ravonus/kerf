import { Boundary, resource } from 'weft'
import { Card, Skeleton } from '@weft/warp'
import type { LoadArgs, Meta, RouteProps } from '@weft/start'
import './slow.css'

const later = <T,>(ms: number, value: T) =>
  new Promise<T>(done => setTimeout(done, ms, value))

export const meta: Meta = { title: 'Streaming a slow page', description: 'A product card whose stock and reviews stream in as they load: the page answers at once and each slow part fills itself in.' }

export const load = ({ request }: LoadArgs) => {
  const asked = new URL(request.url).searchParams.get('ms')
  const ms = Math.min(Number(asked) || 1500, 3000)
  return {
    reviews: later(ms, ['Great beans', 'Arrived fast']),
    stock: later(ms / 2, 12),
  }
}

function Stock(props: { n: Promise<number> }) {
  const n = resource(() => props.n)
  return <p>{n.value} in stock</p>
}

function Reviews(props: { list: Promise<string[]> }) {
  const r = resource(() => props.list)
  return <ul>{(r.value ?? []).map(t => <li key={t}>{t}</li>)}</ul>
}

export default function Slow(props: RouteProps<typeof load>) {
  return (
    <Card title="House blend, 250 g">
      <Boundary pending={<Skeleton />}>
        <Stock n={props.data.stock} />
      </Boundary>
      <Boundary pending={<Skeleton />}>
        <Reviews list={props.data.reviews} />
      </Boundary>
    </Card>
  )
}
