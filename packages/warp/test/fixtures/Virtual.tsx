// The virtual collections at a realistic length, for the a11y gallery.
import { state } from '@weft-js/core'
import { Feed } from '../../src/Feed'
import type { ChatMessage } from '@weft-js/warp-core'
import { Kanban, type KanbanCardData, type KanbanColumn } from '../../src/collab/Kanban'
import { ScrollGrid } from '../../src/ScrollGrid'
import { Thread } from '../../src/collab/Thread'
import { VirtualList } from '../../src/VirtualList'

const words = (i: number) =>
  `Message ${i} about the release, the numbers from yesterday and what needs a second look before Friday`.slice(
    0,
    40 + ((i * 7) % 60),
  )

export function Virtuals() {
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: i, text: words(i) }))
  const messages: ChatMessage[] = Array.from({ length: 500 }, (_, i) => ({
    id: `m${i}`,
    author: { id: i % 3 ? 'mei' : 'me', name: i % 3 ? 'Mei' : 'Me' },
    mine: !(i % 3),
    text: words(i),
    time: '09:41',
    at: i * 60000,
    day: 'Today',
    state: i % 3 ? undefined : 'sent',
  }))
  const feed = Array.from({ length: 500 }, (_, i) => ({
    id: i,
    what: `Ana merged change ${i}`,
    when: '2h',
    detail: words(i),
  }))
  const columns = state<KanbanColumn[]>(
    ['Doing', 'Review'].map((title, c) => ({
      id: title,
      title,
      limit: c ? undefined : 2,
      cards: Array.from({ length: 200 }, (_, i): KanbanCardData => ({
        id: `${title}${i}`,
        title: words(i),
        meta: 'Friday',
      })),
    })),
  )
  const grid = Array.from({ length: 24 }, (_, i) => ({ id: `d${i}`, header: `Day ${i + 1}` }))
  return (
    <>
      <h1>warp virtual collections</h1>
      <VirtualList
        label="Rows"
        height="220px"
        items={rows}
        rowKey={(r) => r.id}
        text={(r) => r.text}
      >
        {(r) => <span data-measure="">{r().text}</span>}
      </VirtualList>
      <div style="block-size:420px">
        <Thread
          label="Release chat"
          header={<b>Release chat</b>}
          messages={messages}
          unreadFrom="m480"
          typing={['Mei']}
          onSend={() => {}}
        />
      </div>
      <Feed label="Activity" height="240px" items={feed} />
      <Kanban label="Sprint" height="360px" columns={columns} />
      <ScrollGrid
        label="Daily metrics"
        corner="Metric"
        height="240px"
        rows={500}
        columns={grid}
        rowHeader={(r) => `Metric ${r + 1}`}
        cell={(r, c) => r * c.id.length}
        negative={(r) => r === 2}
      />
    </>
  )
}
