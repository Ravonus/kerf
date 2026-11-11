import { Search, Stack } from '@kerf-js/veneer'

export const SearchPlaceholder = () => (
  <Stack gap="group">
    <Search
      label="Search projects"
      placeholder="Name, owner or region"
    />
    <Search
      label="Search projects"
      variant="classic"
      placeholder="Name, owner or region"
    />
  </Stack>
)
