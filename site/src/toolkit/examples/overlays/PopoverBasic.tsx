import { Popover } from '@kerf/veneer'

export const PopoverBasic = () => (
  <Popover
    label="What is a preview?"
    title="Preview deploys"
    description={
      'Every branch gets its own address, so' +
      ' you can try a change before it goes live.'
    }
  />
)
