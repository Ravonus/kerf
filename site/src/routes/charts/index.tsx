import type { Meta } from '@kerf/start'
import { VeneerIndex } from '../../components/VeneerIndex'

export const prerender = true
export const meta: Meta = { title: 'Charts', description: 'Veneer charts, for Kerf.' }

export default function Index() {
  return (
    <VeneerIndex
      area="charts"
      title="Charts"
      lede={'Bars, lines, maps and flows, in your theme, with a table view and keyboard support.'}
    />
  )
}
