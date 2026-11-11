import '../theme.css'
import type { RouteProps } from '@kerf-js/start'

export default function Root(props: RouteProps) {
  return <>{props.children}</>
}
