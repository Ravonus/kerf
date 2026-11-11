import { Grid, Stack, Icon, Text } from '@kerf/veneer'
import { LOOK } from './icon-data'

export const IconSet = () => (
  <Grid
    min="xs"
    gap="group"
  >
    {LOOK.map((name) => (
      <Stack
        key={name}
        gap="tight"
        align="center"
      >
        <Icon
          name={name}
          size={24}
        />
        <Text
          role="caption"
          subtle
        >
          {name}
        </Text>
      </Stack>
    ))}
  </Grid>
)
