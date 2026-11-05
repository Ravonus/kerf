import { Menu } from '@weft-js/warp'

export const MenuPlacement = () => (
  <>
    {(['top', 'bottom', 'left', 'right'] as const).map(
      (side) => (
        <Menu
          key={side}
          label={side}
          side={side}
          trigger={{
            emphasis: 'outline',
            tone: 'neutral',
          }}
          items={[
            { label: 'Rename' },
            { label: 'Duplicate' },
            { label: 'Archive' },
          ]}
        />
      ),
    )}
  </>
)
