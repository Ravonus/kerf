import { Button, Stack, Text } from '@kerf/veneer'

export const ButtonEmptyState = () => (
  <Stack
    gap="related"
    align="center"
  >
    <Text role="heading">No projects yet</Text>
    <Text subtle>
      Connect a repository and your first deploy runs in
      about a minute.
    </Text>
    <Button icon="plus">New project</Button>
  </Stack>
)
