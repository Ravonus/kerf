import {
  Center,
  Heading,
  Stack,
  Text,
} from '@weft-js/warp'

export const CenterArticle = () => (
  <Center max="measure">
    <Stack gap="related">
      <Heading level={3}>
        Lower stale windows at the edge
      </Heading>
      <Text subtle>By Jun Tanaka</Text>
      <Text>
        We moved the edge cache's stale window from two
        minutes to thirty seconds. Fresh pages now reach
        people sooner, and the origin barely noticed.
      </Text>
      <Text>
        Prose is easiest to read at about seventy
        characters a line, so articles sit in the measure
        rather than the page's full width.
      </Text>
    </Stack>
  </Center>
)
