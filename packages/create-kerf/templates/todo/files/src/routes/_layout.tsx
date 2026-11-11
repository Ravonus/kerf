import '../theme.css'
import type { RouteProps } from '@kerf/start'

export default function Root(props: RouteProps) {
  return <>{props.children}</>
}
