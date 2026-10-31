import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { feed } from '../../shared/feed'
import '../../shared/feed.css'

function List() {
  const el = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({ count: feed.length, getScrollElement: () => el.current, estimateSize: () => 80, overscan: 6 })
  ;(window as any).__jump = (i: number) => v.scrollToIndex(i, { align: 'start' })
  return (
    <div ref={el} id="scroller">
      <div style={{ height: v.getTotalSize(), position: 'relative' }}>
        {v.getVirtualItems().map(r => <div key={r.key} ref={v.measureElement} data-index={r.index} className="row" data-row={r.index} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${r.start}px)` }}><p>{feed[r.index].text}</p></div>)}
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<List />)
