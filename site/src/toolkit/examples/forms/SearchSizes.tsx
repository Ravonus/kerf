import { Search, Stack } from '@weft-js/warp'

export const SearchSizes = () => (
  <Stack gap="group">
    <Search
      label="Search projects"
      size="sm"
    />
    <Search label="Search projects" />
    <Search
      label="Search projects"
      size="lg"
    />
  </Stack>
)
