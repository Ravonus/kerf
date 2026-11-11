import { render } from '@kerf/core/dom'
import { VirtualList, type VirtualControl } from '@kerf/veneer'
import { feed } from '../../shared/feed'
import '../../shared/feed.css'

const take = (c: VirtualControl) => ((window as any).__jump = (i: number) => c.scrollTo(i))
render(
  () => (
    <VirtualList
      label="Rows"
      scope="feed"
      items={feed}
      rowKey={(r) => r.id}
      text={(r) => r.text}
      estimate={80}
      control={take}
    >
      {(r) => (
        <div class="row" data-row={r().id}>
          <p data-measure="">{r().text}</p>
        </div>
      )}
    </VirtualList>
  ),
  document.getElementById('root')!,
)
document.querySelector('[data-scope="feed"]')!.id = 'scroller'
