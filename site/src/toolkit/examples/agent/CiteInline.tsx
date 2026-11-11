import { Cite, Sources, Stack, Text } from '@kerf/veneer'
import { DEPLOY_SOURCES } from '../../world'
import { CITED } from './shared'

export const CiteInline = () => (
  <Stack gap="group">
    <Text>
      The deploy was held back after three failed
      {' checks '}
      <Cite
        n={1}
        source={DEPLOY_SOURCES[1]}
        href="#cite-s1"
      />
      , and the cause is one retry setting{' '}
      <Cite
        n={2}
        source={DEPLOY_SOURCES[2]}
        href="#cite-s2"
      />
      .
    </Text>
    <Sources
      items={CITED}
      base="cite"
    />
  </Stack>
)
