import type { RouteProps } from '@kerf-js/start'

export default function DetailsLayout(props: RouteProps) {
  return <article>{props.children}</article>
}
