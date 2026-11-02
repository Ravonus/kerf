import { DitherGlyph } from '@weft/warp'
import { type ArtProps, type Meta } from './shared'
import code from './woven-word.tsx?raw'

export const meta: Meta = { name: 'Woven Word', description: 'A word pulled out of the cloth from left to right, with a flash where each thread lands. It stays real text for readers and search.', kind: 'field', code, wide: true }

export default function WovenWord({ live = true }: ArtProps) {
  return <DitherGlyph text="weft" reveal={1.4} pointer="ripple" spark="neutral" cell={3} fit={0.8} weight={500} speed={live ? 1 : 0} ratio="auto" style="position:absolute;inset:0;block-size:100%" />
}
