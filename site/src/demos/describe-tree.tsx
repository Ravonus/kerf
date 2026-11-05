import { onCleanup, onMount, state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

// Each node reports when it is made and when its owner
// cleans it up.
function Part({
  name,
  say,
  children,
}: {
  name: string
  say: (line: string) => void
  children?: unknown
}) {
  onMount(() => say(`${name} made`))
  onCleanup(() =>
    queueMicrotask(() => say(`${name} cleaned up`)),
  )
  return (
    <li>
      {name}
      <ul>{children}</ul>
    </li>
  )
}

export default function Tree() {
  const open = state(true)
  const log = state<string[]>([])
  const say = (line: string) =>
    (log.value = [...log.value.slice(-5), line])
  return (
    <Card title="A branch and its owner">
      <ul>
        <Part
          name="Page"
          say={say}
        >
          {open.value && (
            <Part
              name="Sidebar"
              say={say}
            >
              <Part
                name="Search"
                say={say}
              />
            </Part>
          )}
        </Part>
      </ul>
      <Button onClick={() => (open.value = !open.value)}>
        {open.value ? 'Remove' : 'Add'} the sidebar
      </Button>
      <pre>{log.value.join('\n')}</pre>
    </Card>
  )
}
