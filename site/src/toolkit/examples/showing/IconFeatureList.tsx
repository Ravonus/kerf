import { Stack, Row, Icon, Text } from '@kerf-js/veneer'
import { FACTS } from './icon-data'

export const IconFeatureList = () => (
  <Stack gap="related">
    {FACTS.map((f) => (
      <Row
        key={f.says}
        gap="related"
      >
        <Icon
          name={f.icon}
          size={20}
        />
        <Text>{f.says}</Text>
      </Row>
    ))}
  </Stack>
)
