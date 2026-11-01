import '../theme.css'
import type { RouteProps } from '@weft/start'

export default function Root(props: RouteProps) {
  return <>{props.children}</>
}
