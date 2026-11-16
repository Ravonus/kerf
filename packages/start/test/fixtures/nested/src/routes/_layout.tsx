import { Link, currentPath, type RouteProps } from '@kerf-js/start'

/** A root layout that runs in the browser, as one whose nav follows the path does. */
export default function Root(props: RouteProps) {
  return (
    <div class="root">
      <nav>
        <Link href="/">Home</Link>
        <Link href="/explorer">Network</Link>
        <Link href="/explorer/transactions">Transactions</Link>
      </nav>
      <p class="where">{currentPath()}</p>
      <main>{props.children}</main>
    </div>
  )
}
