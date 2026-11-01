import '../theme.css'
import type { RouteProps } from '@weft/start'

export default function Root(props: RouteProps) {
  return <main class="page">{props.children}</main>
}
