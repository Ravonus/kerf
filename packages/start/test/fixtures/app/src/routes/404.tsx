import type { RouteProps } from '@kerf/start'
import './404.css'

export const meta = { title: 'Page not found', description: 'There is nothing here.' }

export default function NotFound(props: RouteProps) {
  return <h1 class="not-found">Lost? {(props.data as { path: string }).path}</h1>
}
