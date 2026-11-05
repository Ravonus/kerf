import { Search, Stack } from '@weft-js/warp'

export const SearchPlaceholder = () => (
  <Stack gap="group">
    <Search label="Search projects" placeholder="Name, owner or region" />
    <Search label="Search projects" variant="classic" placeholder="Name, owner or region" />
  </Stack>
)
