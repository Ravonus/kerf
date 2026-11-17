import { untrack } from '@kerf-js/core'
import { Link, type RouteProps } from '@kerf-js/start'
import './root.css'

export const meta = { extra: [{ name: 'theme-color', content: '#0b0b0f' }] }

export function load({ request }: { request: Request }) {
  return {
    fail:
      new URL(request.url).searchParams.has('root-fail') && request.headers.has('x-recovery-root'),
  }
}

export default function Root(props: RouteProps<typeof load>) {
  if (untrack(() => props.data.fail)) throw new Error('internal root fixture fault')
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
