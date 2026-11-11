import { Stack, Text } from '@kerf-js/veneer'

/** One state in a States grid: its name, then
 * the field.
 */
export const Cell = ({
  name,
  children,
}: {
  name: string
  children?: unknown
}) => (
  <Stack gap="tight">
    <Text
      role="caption"
      subtle
    >
      {name}
    </Text>
    {children}
  </Stack>
)
