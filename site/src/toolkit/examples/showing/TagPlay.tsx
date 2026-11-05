import { Tag } from '@weft-js/warp'

export const TagPlay = (p: {
  children: string
  tone:
    | 'neutral'
    | 'accent'
    | 'positive'
    | 'caution'
    | 'critical'
    | 'info'
  swatch: boolean
}) => (
  <Tag
    tone={p.tone}
    swatch={p.swatch}
  >
    {p.children}
  </Tag>
)
