import { CheckCircleIcon, InboxIcon, XIcon } from '@weft-js/warp-icons'
import { Button, Checkbox, Heading, Progress, Skeleton, Stack, Text, toast } from '@weft-js/warp'
import { derived } from '@weft-js/core'
import type { View } from '#/lib/views'
import { deleteTodo, listTodos, toggleTodo } from '#/server/todos'

const unsaved = () =>
  toast.show({
    tone: 'critical',
    title: "That didn't save",
    description: 'Your list is back as it was. Try again in a moment.',
  })

const blank = {
  all: {
    icon: InboxIcon,
    title: 'Nothing here yet',
    body: 'Add the first thing on your mind above.',
  },
  active: {
    icon: CheckCircleIcon,
    title: 'All caught up',
    body: 'Nothing left to do. Enjoy it, or add something new.',
  },
  done: {
    icon: InboxIcon,
    title: 'Nothing finished yet',
    body: 'Tick something off and it will land here.',
  },
}

function TodoRow({ todo }: { todo: { id: string; title: string; done: boolean } }) {
  return (
    <li class="todo">
      <Checkbox
        checked={todo.done}
        onChange={(e: Event) =>
          toggleTodo({ id: todo.id, done: (e.currentTarget as HTMLInputElement).checked }).catch(
            unsaved,
          )
        }
      >
        {todo.title}
      </Checkbox>
      <Button
        emphasis="ghost"
        tone="neutral"
        size="sm"
        icon={XIcon}
        label={`Delete ${todo.title}`}
        onClick={() => deleteTodo({ id: todo.id }).catch(unsaved)}
      />
    </li>
  )
}

export function TodoList({ view }: { view: View }) {
  const list = listTodos(() => ({ view }))
  const shown = derived(() => list.value?.rows ?? [])
  const left = derived(() => list.value?.left ?? 0)
  const empty = derived(() => blank[view])

  // Another tab, or another device, may have changed the list while this one was in the background.
  return (
    <Stack gap="group">
      <div class="tally">
        <Text>{left.value} left</Text>
        {view === 'all' && shown.value.length > 0 && (
          <Progress
            label="Done so far"
            value={((shown.value.length - left.value) / shown.value.length) * 100}
          />
        )}
      </div>
      {shown.value.length > 0 ? (
        <ul class="todos" aria-label="Todos">
          {shown.value.map((todo) => (
            <TodoRow key={todo.id} todo={todo} />
          ))}
        </ul>
      ) : (
        <div class="blank">
          <empty.value.icon />
          <Heading level={2}>{empty.value.title}</Heading>
          <Text subtle>{empty.value.body}</Text>
        </div>
      )}
    </Stack>
  )
}

export function TodoListLoading() {
  return (
    <Stack gap="group" aria-busy="true" aria-label="Loading your list">
      <Skeleton width="5rem" />
      <div class="todos">
        <Skeleton lines={6} height="1.5rem" />
      </div>
    </Stack>
  )
}
