import type { Meta } from '@kerf/start'
import { VeneerIndex } from '../../components/VeneerIndex'

export const prerender = true
export const meta: Meta = { title: 'Components', description: 'Veneer components, for Kerf.' }

export default function Index() {
  return (
    <VeneerIndex
      area="components"
      title="Components"
      lede={
        'The building blocks: buttons, fields, overlays, layout, data and dates. Install <code data-scope="code">@kerf/veneer</code> and import what you use.'
      }
    />
  )
}
