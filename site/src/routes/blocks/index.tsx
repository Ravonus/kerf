import type { Meta } from '@kerf/start'
import { VeneerIndex } from '../../components/VeneerIndex'

export const prerender = true
export const meta: Meta = { title: 'Blocks', description: 'Veneer blocks, for Kerf.' }

export default function Index() {
  return (
    <VeneerIndex
      area="blocks"
      title="Blocks"
      lede={'Whole features you can drop in: chat, settings, sign-in, calls and calendars.'}
    />
  )
}
