import type { Meta } from '@weft-js/start'
import { WarpIndex } from '../../components/WarpIndex'

export const prerender = true
export const meta: Meta = { title: 'Charts', description: 'warp charts, for weft.' }

export default function Index() {
  return <WarpIndex area="charts" title="Charts" lede={'Bars, lines, maps and flows, in your theme, with a table view and keyboard support.'} />
}
