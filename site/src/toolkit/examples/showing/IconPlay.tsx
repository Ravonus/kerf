import type { IconName } from '@kerf-js/veneer'
import { Icon } from '@kerf-js/veneer'

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
