import type { RouteProps } from '@weft/start'

export const meta = { title: 'Page not found', description: 'There is nothing here.' }

export default function NotFound(props: RouteProps) {
  return <h1 class="not-found">Lost? {(props.data as { path: string }).path}</h1>
}
