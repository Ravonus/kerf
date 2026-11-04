import { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { feed } from '../../shared/feed'
import '../../shared/feed.css'

function List() {
  const v = useRef<VirtuosoHandle>(null)
  ;(window as any).__jump = (i: number) => v.current?.scrollToIndex({ index: i, align: 'start' })
  return (
    <Virtuoso
      ref={v}
      id="scroller"
      style={{ height: 600 }}
      data={feed}
      defaultItemHeight={80}
      itemContent={(i, r) => (
        <div className="row" data-row={i}>
          <p>{r.text}</p>
        </div>
      )}
    />
  )
}
createRoot(document.getElementById('root')!).render(<List />)
