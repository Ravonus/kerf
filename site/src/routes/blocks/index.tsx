import type { Meta } from '@weft-js/start'
import { WarpIndex } from '../../components/WarpIndex'

export const prerender = true
export const meta: Meta = { title: 'Blocks', description: 'warp blocks, for weft.' }

export default function Index() {
  return <WarpIndex area="blocks" title="Blocks" lede={'Whole features you can drop in: chat, settings, sign-in, calls and calendars.'} />
}
