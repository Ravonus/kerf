import { Stack, Text } from '@kerf/veneer'

export const TextDeployNote = () => (
  <Stack gap="tight">
    <Text
      role="eyebrow"
      subtle
    >
      Deploy d-4819
    </Text>
    <Text role="heading">
      Retry timed out upstream calls
    </Text>
    <Text subtle>
      Sam Okafor pushed this to main. It stopped at the
      health check after four minutes.
    </Text>
    <Text
      role="caption"
      tone="critical"
    >
      Failed, 31 October at 15:27
    </Text>
  </Stack>
)
