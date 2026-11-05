import { Stack, Row, Icon, Text } from '@weft-js/warp'
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
