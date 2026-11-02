import type { RouteProps } from '@weft/start'
import { WarpShell } from '../../components/WarpShell'

export default function Layout(props: RouteProps) {
  return <WarpShell area="components">{props.children}</WarpShell>
}
