import type { RouteProps } from '@weft/start'
import { WarpShell } from '../../components/WarpShell'

export default function Layout(props: RouteProps) {
  return <WarpShell area="blocks">{props.children}</WarpShell>
}
