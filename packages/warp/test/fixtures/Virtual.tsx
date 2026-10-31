// The virtual collections at a realistic length, for the a11y gallery.
import { state } from 'weft'
import { Feed } from '../../src/Feed'
import { Kanban, type KanbanCard } from '../../src/Kanban'
import { ScrollGrid } from '../../src/ScrollGrid'
import { Thread, type ThreadMessage } from '../../src/Thread'
import { VirtualList } from '../../src/VirtualList'

const words = (i: number) => `Message ${i} about the release, the numbers from yesterday and what needs a second look before Friday`.slice(0, 40 + (i * 7) % 60)

export function Virtuals() {
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: i, text: words(i) }))
  const messages: ThreadMessage[] = Array.from({ length: 500 }, (_, i) => ({ id: `m${i}`, author: i % 3 ? 'Mei' : 'Me', initials: 'ME', text: words(i), time: '09:41', at: i * 60000, day: 'Today', state: i % 3 ? undefined : 'sent' }))
  const feed = Array.from({ length: 500 }, (_, i) => ({ id: i, what: `Ana merged change ${i}`, when: '2h', detail: words(i) }))
  const columns = state(['Doing', 'Review'].map((title, c) => ({ id: title, title, limit: c ? undefined : 2, cards: Array.from({ length: 200 }, (_, i): KanbanCard => ({ id: `${title}${i}`, title: words(i), meta: 'Friday' })) })))
  const move = (card: KanbanCard, to: string, index: number) => {
    columns.value = columns.value.map(c => {
      const rest = c.cards.filter(x => x.id !== card.id)
      return c.id === to ? { ...c, cards: [...rest.slice(0, index), card, ...rest.slice(index)] } : { ...c, cards: rest }
    })
  }
  const grid = Array.from({ length: 24 }, (_, i) => ({ id: `d${i}`, header: `Day ${i + 1}` }))
  return (
    <>
      <h1>warp virtual collections</h1>
      <VirtualList label="Rows" height="220px" items={rows} rowKey={r => r.id} text={r => r.text}>{r => <span data-measure="">{r().text}</span>}</VirtualList>
      <div style="block-size:420px"><Thread label="Release chat" subtitle="6 members" me="Me" messages={messages} unread="m480" typing="Mei is typing" onSend={() => {}} /></div>
      <Feed label="Activity" height="240px" items={feed} />
      <Kanban label="Sprint" height="360px" columns={columns.value} onMove={move} />
      <ScrollGrid label="Daily metrics" corner="Metric" height="240px" rows={500} columns={grid} rowHeader={r => `Metric ${r + 1}`} cell={(r, c) => r * c.id.length} negative={r => r === 2} />
    </>
  )
}
