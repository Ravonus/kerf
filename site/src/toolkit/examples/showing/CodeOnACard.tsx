import { Card, Text, Code } from '@kerf-js/veneer'

export const CodeOnACard = () => (
  <Card
    eyebrow="Latest"
    title="Cache product images at the edge"
  >
    <Text subtle>
      Deployed <Code>9f3ac21</Code>
      {' from '}
      <Code>main</Code> to <Code>eu-west</Code>.
    </Text>
  </Card>
)
