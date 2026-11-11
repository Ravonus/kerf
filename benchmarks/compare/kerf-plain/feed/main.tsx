import { onMount, state } from '@kerf-js/core'
import { For, render } from '@kerf-js/core/dom'
import { virtualizer, type Virtualizer } from '@kerf-js/veneer-core'
import { feed } from '../../shared/feed'
import '../../shared/feed.css'

function List() {
  let el: HTMLElement | undefined, box: HTMLElement | undefined, v: Virtualizer | undefined
  const shown = state<number[]>([])
  onMount(() => {
    v = virtualizer(el!, {
      keys: feed.map((r) => r.id),
      spacer: box!,
      estimate: 80,
      onRange: (i) => (shown.value = i),
    })
    ;(window as any).__jump = (i: number) => v!.scrollTo(i)
  })
  const Row = (p: { i: () => number }) => {
    let row: HTMLElement | undefined
    onMount(() => v!.attach(row!, p.i()))
    return (
      <div
        ref={(n: any) => (row = n)}
        class="row"
        data-row={p.i()}
        style="position:absolute;inset-inline:0;top:0"
      >
        <p>{feed[p.i()].text}</p>
      </div>
    )
  }
  return (
    <div ref={(n: any) => (el = n)} id="scroller">
      <div ref={(n: any) => (box = n)} style="position:relative">
        <For each={shown.value} by={(i) => i}>
          {(i) => <Row i={i} />}
        </For>
      </div>
    </div>
  )
}
render(() => <List />, document.getElementById('root')!)
