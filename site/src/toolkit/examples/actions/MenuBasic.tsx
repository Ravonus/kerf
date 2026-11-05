import { Menu } from '@weft-js/warp'

export const MenuBasic = () => (
  <Menu
    label="Actions"
    items={[
      { label: 'Rename', icon: 'pencil', shortcut: '⌘R' },
      {
        label: 'Duplicate',
        icon: 'copy',
        shortcut: '⌘D',
      },
      { separator: true },
      {
        label: 'Delete',
        icon: 'trash',
        tone: 'critical',
      },
    ]}
  />
)
