import type { Meta } from '@weft-js/start'
import { WarpIndex } from '../../components/WarpIndex'

export const prerender = true
export const meta: Meta = { title: 'Components', description: 'Warp components, for Weft.' }

export default function Index() {
  return (
    <WarpIndex
      area="components"
      title="Components"
      lede={
        'The building blocks: buttons, fields, overlays, layout, data and dates. Install <code data-scope="code">@weft-js/warp</code> and import what you use.'
      }
    />
  )
}
