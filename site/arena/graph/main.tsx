import { derived, onCleanup, state } from 'weft'
import { render } from 'weft/dom'
import { graph } from 'weft/devtools'

function Todos() {
  const todos = state(['Buy beans', 'Brew'])
  const done = state(0)
  const left = derived(() => todos.value.length - done.value)
  return (
    <main>
      <button onClick={() => (todos.value = [...todos.value, `Task ${todos.value.length + 1}`])}>Add a task</button>
      <button disabled={left.value === 0} onClick={() => done.value++}>Finish one</button>
      <ul>{todos.value.map(t => <li key={t}>{t}</li>)}</ul>
      <p>{left.value} left</p>
    </main>
  )
}

// What an agent reads, here or through `weft mcp`: every named value, what it reads and what reads it.
function Graph() {
  const lines = state<string[]>([])
  const was = new Map<string, string>()
  const timer = setInterval(() => {
    lines.value = graph().map(n => {
      const line = JSON.stringify({ name: n.name, value: n.value, reads: n.reads, feeds: n.feeds })
      const lit = was.has(n.name) && was.get(n.name) !== line
      was.set(n.name, line)
      return (lit ? '*' : ' ') + line
    }).filter(l => !l.includes('"Graph'))
  }, 300)
  onCleanup(() => clearInterval(timer))
  return <pre>{lines.value.map(l => <div key={l} class={l[0] === '*' ? 'lit' : ''}>{l.slice(1)}</div>)}</pre>
}

render(() => <><Todos /><Graph /></>, document.getElementById('app')!)
