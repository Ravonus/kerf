import { Menu } from '@kerf-js/veneer'

export const MenuAlignment = () => (
  <>
    {(['start', 'center', 'end'] as const).map(
      (align) => (
        <Menu
          key={align}
          label={align}
          align={align}
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
