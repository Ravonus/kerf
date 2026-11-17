import { onCleanup, onMount, state } from '@kerf-js/core'
import type { RouteProps } from '@kerf-js/start'

export default function RecoveryLayout(props: RouteProps) {
  const count = state(0)
  const pulses = state(0)
  onMount(() => {
    const heard = () => pulses.value++
    window.addEventListener('kerf-test-pulse', heard)
    onCleanup(() => window.removeEventListener('kerf-test-pulse', heard))
  })
  return (
    <section>
      <button id="recovery-count" onClick={() => count.value++}>
        Count {count.value}
      </button>
      <output id="recovery-pulses">{pulses.value}</output>
      {props.children}
    </section>
  )
}
