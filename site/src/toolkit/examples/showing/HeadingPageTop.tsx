import { Stack, Heading, Text } from '@kerf-js/veneer'

export const HeadingPageTop = () => (
  <Stack gap="section">
    <Stack gap="tight">
      <Heading level={1}>Deploys</Heading>
      <Text subtle>
        Everything shipped to storefront this month.
      </Text>
    </Stack>
    <Stack gap="tight">
      <Heading level={2}>Failed</Heading>
      <Text subtle>
        Retry timed out upstream calls, by Sam Okafor.
      </Text>
    </Stack>
    <Stack gap="tight">
      <Heading level={2}>Live</Heading>
      <Text subtle>
        Cache product images at the edge, by Priya Raman.
      </Text>
    </Stack>
  </Stack>
)
