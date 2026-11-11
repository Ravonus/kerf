import { derived, state } from '@kerf/core'
import { LoadMore, Stack } from '@kerf/veneer'
import { PROJECTS } from '../../world'
import { ProjectRow } from './shared'

export function LoadMoreScrolling() {
  const shown = state(6)
  const loading = state(false)
  let box: HTMLElement | undefined
  const load = () => {
    loading.value = true
    setTimeout(() => {
      shown.value += 4
      loading.value = false
    }, 700)
  }
  const done = derived(
    () => shown.value >= PROJECTS.length,
  )
  return (
    <Stack
      gap="related"
      ref={(n: HTMLElement) => (box = n)}
      style="block-size:220px;overflow-y:auto"
    >
      {PROJECTS.slice(0, shown.value).map((p) => (
        <ProjectRow
          key={p.id}
          name={p.name}
          owner={p.owner}
        />
      ))}
      <LoadMore
        root={() => box ?? null}
        loading={loading.value}
        done={done.value}
        message={
          done.value ? 'That is every project.' : ''
        }
        onLoad={load}
      />
    </Stack>
  )
}
