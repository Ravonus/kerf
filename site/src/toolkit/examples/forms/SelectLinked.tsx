import { derived, state } from '@weft-js/core'
import { Select, Stack, Text } from '@weft-js/warp'
import { PROJECTS } from '../../world'
import { PROJECT_OPTIONS } from './shared'

export function SelectLinked() {
  const project = state<string | null>('mobile-bff')
  const picked = derived(() =>
    PROJECTS.find((p) => p.id === project.value)!,
  )
  const details = derived(() => {
    const { status, region, deploys } = picked.value
    return (
      `${status} in ${region}, ` +
      `${deploys} deploys so far.`
    )
  })
  return (
    <Stack gap="related">
      <Select
        label="Project"
        searchable
        options={PROJECT_OPTIONS}
        value={project}
      />
      <Text subtle>{details.value}</Text>
    </Stack>
  )
}
