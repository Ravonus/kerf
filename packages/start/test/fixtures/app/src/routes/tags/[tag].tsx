// A param route with no `load` and no `prerender`: its card is rendered on demand (H002 on a static-only preset).
import type { Meta, RouteProps } from '@kerf/start'

export const meta: Meta<never, '/tags/[tag]'> = ({ params }) => ({
  title: `#${params.tag}`,
  description: `Posts tagged ${params.tag}.`,
})

export default function Tag(props: RouteProps<never, '/tags/[tag]'>) {
  return <h1 class="tag">#{props.params.tag}</h1>
}
