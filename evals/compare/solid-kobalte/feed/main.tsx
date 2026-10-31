import { createVirtualizer } from '@tanstack/solid-virtual'
import { For } from 'solid-js'
import { render } from 'solid-js/web'
import { feed } from '../../shared/feed'
import '../../shared/feed.css'

function List() {
  let el: HTMLDivElement | undefined
  const v = createVirtualizer({ count: feed.length, getScrollElement: () => el!, estimateSize: () => 80, overscan: 6 })
  ;(window as any).__jump = (i: number) => v.scrollToIndex(i, { align: 'start' })
  return (
    <div ref={el} id="scroller">
      <div style={{ height: `${v.getTotalSize()}px`, position: 'relative' }}>
        <For each={v.getVirtualItems()}>{r => <div ref={el => queueMicrotask(() => v.measureElement(el))} data-index={r.index} class="row" data-row={r.index} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${r.start}px)` }}><p>{feed[r.index].text}</p></div>}</For>
      </div>
    </div>
  )
}
render(() => <List />, document.getElementById('root')!)
