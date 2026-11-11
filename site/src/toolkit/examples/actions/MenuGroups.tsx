import { Menu } from '@kerf/veneer'

export const MenuGroups = () => (
  <Menu
    label="Deploy to"
    items={[
      { group: 'Production' },
      { label: 'eu-west' },
      { label: 'us-east' },
      { group: 'Preview' },
      { label: 'staging' },
    ]}
  />
)
