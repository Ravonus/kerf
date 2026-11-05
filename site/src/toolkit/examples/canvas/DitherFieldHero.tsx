import { DitherField, Inset, Stack, Heading, Text, Button } from '@weft-js/warp'

export const DitherFieldHero = () => (
  <DitherField kind="weave" fade="left" ratio="21 / 9">
    <Inset pad="section">
      <Stack gap="group" align="start">
        <Heading>Deploys that stay out of the way</Heading>
        <Text subtle>Push to main. weft builds, tests and ships it.</Text>
        <Button icon="rocket">Start a project</Button>
      </Stack>
    </Inset>
  </DitherField>
)
