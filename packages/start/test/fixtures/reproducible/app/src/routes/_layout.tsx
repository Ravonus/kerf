import { Link, type RouteProps } from '@kerf-js/start'
import './root.css'

export default function Layout(props: RouteProps) {
  return (
    <main class="release">
      <Link href="/details">Details</Link>
      {props.children}
    </main>
  )
}
