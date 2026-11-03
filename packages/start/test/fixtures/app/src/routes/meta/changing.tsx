// A loader whose data differs on every request: the built-in card reads only the head, so its URL can't change.
import type { Meta, RouteProps } from '@weft-js/start'

let n = 0
export const load = () => ({ at: ++n })
export const meta: Meta<typeof load> = { title: 'Changing', description: 'The same words on every request, whatever the loader returned.' }

export default function Changing(props: RouteProps<typeof load>) {
  return <p>{props.data.at}</p>
}
