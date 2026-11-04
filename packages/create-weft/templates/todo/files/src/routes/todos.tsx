import { ChecksIcon, CircleIcon, ClipboardListIcon, LogOutIcon } from '@weft-js/warp-icons'
import { redirect, type LoadArgs, type Meta, type RouteProps } from '@weft-js/start'
import { Alert, Button, Heading, Shell, Stack, Toaster, toast } from '@weft-js/warp'
import { Boundary } from '@weft-js/core'
import { Logo } from '#/components/Logo'
import { NewTodo } from '#/components/NewTodo'
import { TodoList, TodoListLoading } from '#/components/TodoList'
import { viewOf, views } from '#/lib/views'
import { signOut } from '#/server/session'

export const load = ({ ctx, request }: LoadArgs) => {
  if (!ctx.user) redirect('/login')
  return { view: viewOf(request.url), name: ctx.user.name, email: ctx.user.email }
}

export const meta: Meta<typeof load> = ({ data }) => ({ title: views[data.view].title })

const nav = [
  {
    items: [
      { id: 'all', label: views.all.label, href: views.all.href, icon: ClipboardListIcon },
      { id: 'active', label: views.active.label, href: views.active.href, icon: CircleIcon },
      { id: 'done', label: views.done.label, href: views.done.href, icon: ChecksIcon },
    ],
  },
]

const leave = () =>
  signOut().catch(() =>
    toast.show({
      tone: 'critical',
      title: "You're still signed in",
      description: "That didn't go through. Try again in a moment.",
    }),
  )
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

export default function Todos(props: RouteProps<typeof load>) {
  return (
    <Shell
      brand={{ name: 'Daybook', href: '/todos', mark: <Logo /> }}
      nav={nav}
      navLabel="Views"
      current={props.data.view}
      account={{
        name: props.data.name,
        email: props.data.email,
        initials: initials(props.data.name),
        items: [{ label: 'Sign out', icon: LogOutIcon, onSelect: leave }],
      }}
      overlays={<Toaster />}
    >
      <Stack gap="group" class="day">
        <Heading level={1} role="title">
          {views[props.data.view].title}
        </Heading>
        <NewTodo />
        <Boundary
          pending={<TodoListLoading />}
          error={(_, retry) => (
            <Alert
              tone="critical"
              title="Your list didn't load"
              live
              actions={
                <Button emphasis="outline" onClick={retry}>
                  Try again
                </Button>
              }
            >
              Nothing's lost. It's the connection to your list that failed.
            </Alert>
          )}
        >
          <TodoList view={props.data.view} />
        </Boundary>
      </Stack>
    </Shell>
  )
}
