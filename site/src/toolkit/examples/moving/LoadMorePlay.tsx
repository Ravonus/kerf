import { derived, state } from '@weft-js/core'
import { LoadMore, Stack } from '@weft-js/warp'
import { PROJECTS } from '../../world'
import { ProjectRow } from './shared'

export function LoadMorePlay(p: { auto: boolean; message: string }) {
  const shown = state(4)
  const loading = state(false)
  const done = derived(() => shown.value >= PROJECTS.length)
  let box: HTMLElement | undefined
  const load = () => {
    loading.value = true
    setTimeout(() => {
      shown.value += 3
      loading.value = false
    }, 800)
  }
  return (
    <Stack
      gap="related"
      ref={(n: HTMLElement) => (box = n)}
      style="block-size:240px;overflow-y:auto"
    >
      {PROJECTS.slice(0, shown.value).map((x) => (
        <ProjectRow key={x.id} name={x.name} owner={x.owner} />
      ))}
      <LoadMore
        auto={p.auto}
        root={() => box ?? null}
        loading={loading.value}
        done={done.value}
        message={p.message}
        onLoad={load}
      />
    </Stack>
  )
}
