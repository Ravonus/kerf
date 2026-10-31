import { Link, type RouteProps } from '@weft/start'
import './root.css'

export const meta = { extra: [{ name: 'theme-color', content: '#0b0b0f' }] }

export default function Root(props: RouteProps) {
  return (
    <div class="root">
      <nav>
        <Link href="/">Home</Link>
        <Link href="/about">About</Link>
        <Link href="/users">Users</Link>
      </nav>
      {props.children}
    </div>
  )
}
