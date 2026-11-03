import type { RouteProps } from '@weft-js/start'
import { WarpShell } from '../../components/WarpShell'

export default function Layout(props: RouteProps) {
  return <WarpShell area="blocks" slug={props.params.slug}>{props.children}</WarpShell>
}
