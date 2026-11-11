import { onMount, state } from '@kerf/core'
import { Link, type LoadArgs, type RouteProps } from '@kerf/start'
import { db } from '../../db'

export const load = async (_: LoadArgs) => ({ users: await db.users() })

export const meta = { og: { type: 'profile' } }

/** Counts mounts so tests can see that navigating between users keeps this layout. */
export const mounts = state(0)

export default function Users(props: RouteProps<typeof load>) {
  onMount(() => void mounts.value++)
  return (
    <section class="users">
      <ul>
        {props.data.users.map((u) => (
          <li key={u.id}>
            <Link href={`/users/${u.id}`}>{u.name}</Link>
          </li>
        ))}
      </ul>
      <div class="detail">{props.children}</div>
    </section>
  )
}
