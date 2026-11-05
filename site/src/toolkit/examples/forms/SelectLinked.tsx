import { derived, state } from '@weft-js/core'
import { Select, Stack, Text } from '@weft-js/warp'
import { PROJECTS } from '../../world'
import { PROJECT_OPTIONS } from './shared'

export function SelectLinked() {
  const project = state<string | null>('mobile-bff')
  const picked = derived(() => PROJECTS.find((p) => p.id === project.value)!)
  return (
    <Stack gap="related">
      <Select label="Project" searchable options={PROJECT_OPTIONS} value={project} />
      <Text subtle>
        {picked.value.status} in {picked.value.region}, {picked.value.deploys} deploys so far.
      </Text>
    </Stack>
  )
}
