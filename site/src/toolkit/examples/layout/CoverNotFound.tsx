import {
  Button,
  Center,
  Cover,
  Heading,
  Stack,
  Text,
} from '@kerf-js/veneer'
import { SCREEN } from './shared'

export const CoverNotFound = () => (
  <Cover style={SCREEN}>
    <Center
      data-part="center"
      max="narrow"
      intrinsic
    >
      <Stack
        gap="related"
        align="center"
      >
        <Text
          role="eyebrow"
          subtle
        >
          404
        </Text>
        <Heading
          level={3}
          role="title"
        >
          No such project
        </Heading>
        <Text subtle>
          It may have been renamed, or you may not have
          access.
        </Text>
        <Button
          icon="arrow-left"
          emphasis="outline"
          tone="neutral"
        >
          Back to projects
        </Button>
      </Stack>
    </Center>
  </Cover>
)
