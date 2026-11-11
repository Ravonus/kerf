import {
  Button,
  Center,
  Heading,
  Stack,
  Text,
} from '@kerf-js/veneer'

export const CenterIntrinsic = () => (
  <Center
    max="narrow"
    intrinsic
  >
    <Stack
      gap="related"
      align="center"
    >
      <Heading level={3}>
        Nothing failed this week
      </Heading>
      <Text subtle>
        intrinsic centres each child at its own width, and
        centres the text.
      </Text>
      <Button
        emphasis="outline"
        tone="neutral"
      >
        See all deploys
      </Button>
    </Stack>
  </Center>
)
