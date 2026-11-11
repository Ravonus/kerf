import { Popover } from '@kerf-js/veneer'

export const PopoverTrigger = () => (
  <>
    <Popover
      label="Soft"
      trigger={{ emphasis: 'soft' }}
      title="Soft"
    />
    <Popover
      label="With an icon"
      trigger={{
        icon: 'info',
        emphasis: 'ghost',
        tone: 'neutral',
      }}
      title="Ghost"
    />
    <Popover
      label="Small"
      trigger={{ size: 'sm' }}
      title="Small"
    />
  </>
)
