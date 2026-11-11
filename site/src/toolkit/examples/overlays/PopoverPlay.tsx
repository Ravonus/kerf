import { Popover } from '@kerf/veneer'

export const PopoverPlay = (p: {
  side: 'top' | 'bottom' | 'left' | 'right'
  align: 'start' | 'center' | 'end'
  title: string
}) => (
  <Popover
    label="Details"
    side={p.side}
    align={p.align}
    title={p.title}
    description="Deployed 2 minutes ago by Priya."
  />
)
