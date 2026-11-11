import { Card, Inset, Stack, Text } from '@kerf/veneer'
import { LOG } from './shared'

export const InsetBuildLog = () => (
  <Card title="Build output">
    <Inset>
      <Stack gap="hair">
        {LOG.map((line) => (
          <Text
            key={line}
            role="code"
          >
            {line}
          </Text>
        ))}
      </Stack>
    </Inset>
  </Card>
)
