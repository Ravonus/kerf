import { Menu } from '@kerf/veneer'

export const MenuTrigger = () => (
  <>
    <Menu
      label="Sort"
      trigger={{ emphasis: 'ghost', tone: 'neutral' }}
      items={[{ label: 'Newest' }, { label: 'Oldest' }]}
    />
    <Menu
      label="Export"
      trigger={{ emphasis: 'soft' }}
      items={[{ label: 'CSV' }, { label: 'JSON' }]}
    />
    <Menu
      label="More"
      trigger={{
        emphasis: 'outline',
        tone: 'neutral',
        size: 'sm',
      }}
      items={[{ label: 'Archive' }]}
    />
  </>
)
