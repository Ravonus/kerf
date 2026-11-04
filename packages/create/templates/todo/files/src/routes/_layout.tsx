import '../theme.css'
import type { RouteProps } from '@weft-js/start'

export default function Root(props: RouteProps) {
  return <>{props.children}</>
}
