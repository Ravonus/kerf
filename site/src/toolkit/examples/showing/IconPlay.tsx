import type { IconName } from '@kerf/veneer'
import { Icon } from '@kerf/veneer'

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
