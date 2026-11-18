import { state } from '@kerf-js/core'
import { Link, type RouteProps } from '@kerf-js/start'

export default function Layout(props: RouteProps) {
  if (typeof document === 'undefined') throw new Error('Layout rendered on the peer')
  const count = state(0)
  return (
    <section>
      <nav>
        <Link href="/">Home</Link>
        <Link href="/items/42">Item</Link>
        <Link href="/alias">Alias</Link>
        <Link href="/broken">Broken</Link>
        <Link href="/missing">Missing</Link>
      </nav>
      <button type="button" onClick={() => count.value++}>
        Counter {count.value}
      </button>
      {props.children}
    </section>
  )
}
