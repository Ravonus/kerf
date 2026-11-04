import { state } from '@weft-js/core'
import { Badge, Button, Card } from '@weft-js/warp'

const READERS = ['Alice', 'Bob']

export default function LiveTags() {
  // Stands in for the database: a mutation writes here,
  // then pokes the tag `todos`.
  const db = state(['Pack the tent', 'Book the train'])
  const tabs = READERS.map((name) => ({
    name,
    rows: state(db.value),
    up: state(true),
    missed: state(false),
  }))
  type Tab = (typeof tabs)[number]

  // A poke: every connected reader of the tag refetches.
  // One that's away catches up when it's back.
  const poke = () => {
    for (const t of tabs) {
      if (t.up.value) t.rows.value = db.value
      else t.missed.value = true
    }
  }
  const add = (t: Tab) => {
    db.value = [
      ...db.value,
      `${t.name}'s todo ${db.value.length + 1}`,
    ]
    poke()
  }
  const toggle = (t: Tab) => {
    t.up.value = !t.up.value
    if (t.up.value && t.missed.value) {
      t.rows.value = db.value
      t.missed.value = false
    }
  }

  return (
    <Card title="One live query, two browsers">
      {tabs.map((t) => (
        <section key={t.name}>
          <p>
            <b>{t.name}</b>{' '}
            <Badge
              tone={t.up.value ? 'positive' : 'caution'}
            >
              {t.up.value ? 'live' : 'reconnecting'}
            </Badge>
          </p>
          <ul>
            {t.rows.value.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
          <Button
            size="sm"
            disabled={!t.up.value}
            onClick={() => add(t)}
          >
            Add a todo
          </Button>{' '}
          <Button
            size="sm"
            emphasis="ghost"
            tone="neutral"
            onClick={() => toggle(t)}
          >
            {t.up.value
              ? 'Drop the connection'
              : 'Reconnect'}
          </Button>
        </section>
      ))}
    </Card>
  )
}
