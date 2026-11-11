import { state } from '@kerf-js/core'
import { Badge, Button, Card } from '@kerf-js/veneer'

// A stand-in for the query cache. Each query has tags; a
// mutation names tags in `invalidates`, and every query
// that shares one is fetched again. The counts show which
// ones were.
const QUERIES = [
  { name: 'listTodos', tags: ['todos'] },
  { name: 'countDone', tags: ['todos', 'stats'] },
  { name: 'me', tags: ['session'] },
]
const MUTATIONS = [
  { name: 'addTodo', invalidates: ['todos'] },
  { name: 'resetStats', invalidates: ['stats'] },
  { name: 'rename', invalidates: ['session'] },
]

export default function Tags() {
  const fetches = state<Record<string, number>>({
    listTodos: 1,
    countDone: 1,
    me: 1,
  })
  const last = state<string[]>([])
  const run = (invalidates: string[]) => {
    const matching = QUERIES.filter((q) =>
      q.tags.some((t) => invalidates.includes(t)),
    )
    const hit = matching.map((q) => q.name)
    fetches.set((d) => {
      for (const name of hit) d[name] = (d[name] ?? 0) + 1
    })
    last.value = hit
  }
  return (
    <Card title="Tags">
      {QUERIES.map((q) => (
        <p key={q.name}>
          <code>{q.name}</code>{' '}
          {q.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}{' '}
          <Badge
            tone={
              last.value.includes(q.name)
                ? 'positive'
                : 'neutral'
            }
          >
            fetched {fetches.get(q.name)}×
          </Badge>
        </p>
      ))}
      <p>
        {MUTATIONS.map((m) => (
          <Button
            key={m.name}
            size="sm"
            emphasis="soft"
            onClick={() => run(m.invalidates)}
          >
            {m.name} → {m.invalidates.join(', ')}
          </Button>
        ))}
      </p>
    </Card>
  )
}
