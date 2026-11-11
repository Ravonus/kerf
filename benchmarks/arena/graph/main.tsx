import { derived, onCleanup, state } from '@kerf-js/core'
import { render } from '@kerf-js/core/dom'
import { graph } from '@kerf-js/core/devtools'

function Todos() {
  const todos = state(['Buy beans', 'Brew'])
  const done = state(0)
  const left = derived(
    () => todos.value.length - done.value,
  )
  const addTask = () => {
    const task = `Task ${todos.value.length + 1}`
    todos.value = [...todos.value, task]
  }
  return (
    <main>
      <button onClick={addTask}>Add a task</button>
      <button
        disabled={left.value === 0}
        onClick={() => done.value++}
      >
        Finish one
      </button>
      <ul>
        {todos.value.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p>{left.value} left</p>
    </main>
  )
}

// An agent here or through `kerf mcp` reads each
// named value, what it reads and what reads it.
function Graph() {
  const lines = state<string[]>([])
  const was = new Map<string, string>()
  const timer = setInterval(() => {
    lines.value = graph()
      .map(({ name, value, reads, feeds }) => {
        const line = JSON.stringify({
          name,
          value,
          reads,
          feeds,
        })
        const lit =
          was.has(name) && was.get(name) !== line
        was.set(name, line)
        return (lit ? '*' : ' ') + line
      })
      .filter((l) => !l.includes('"Graph'))
  }, 300)
  onCleanup(() => clearInterval(timer))
  return (
    <pre>
      {lines.value.map((l) => (
        <div
          key={l}
          class={l[0] === '*' ? 'lit' : ''}
        >
          {l.slice(1)}
        </div>
      ))}
    </pre>
  )
}

render(
  () => (
    <>
      <Todos />
      <Graph />
    </>
  ),
  document.getElementById('app')!,
)
