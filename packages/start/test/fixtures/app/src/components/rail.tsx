import { onMount } from '@kerf/core'

/** Takes its children from the page, and has work of its own to do once mounted, as veneer's Nav does. */
export function Rail(props: { children?: unknown }) {
  let el: HTMLElement | undefined
  onMount(() => void setTimeout(() => el?.setAttribute('data-ready', '')))
  return (
    <nav class="rail" ref={(n: any) => (el = n)}>
      {props.children}
      <span class="rail-bar"></span>
    </nav>
  )
}
