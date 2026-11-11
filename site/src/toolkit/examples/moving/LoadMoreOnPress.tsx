import { derived, state } from '@kerf/core'
import { LoadMore, Shape, Stack } from '@kerf/veneer'
import { PROJECTS } from '../../world'
import { ProjectRow } from './shared'

export function LoadMoreOnPress() {
  const shown = state(3)
  const loading = state(false)
  const load = () => {
    loading.value = true
    setTimeout(() => {
      shown.value += 3
      loading.value = false
    }, 800)
  }
  const done = derived(
    () => shown.value >= PROJECTS.length,
  )
  return (
    <Stack gap="related">
      {PROJECTS.slice(0, shown.value).map((p) => (
        <ProjectRow
          key={p.id}
          name={p.name}
          owner={p.owner}
        />
      ))}
      {loading.value && (
        <Shape
          kind="text"
          lines={2}
          label="Loading projects"
        />
      )}
      <LoadMore
        auto={false}
        loading={loading.value}
        done={done.value}
        message={
          done.value
            ? 'That is every project.'
            : `${shown.value} of ${PROJECTS.length}`
        }
        onLoad={load}
      />
    </Stack>
  )
}
