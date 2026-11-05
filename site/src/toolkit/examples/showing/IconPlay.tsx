import type { IconName } from '@weft-js/warp'
import { Icon } from '@weft-js/warp'

export const IconPlay = (p: {
  name: IconName
  size: number
  solid: boolean
}) => (
  <Icon
    name={p.name}
    size={p.size}
    solid={p.solid}
  />
)
