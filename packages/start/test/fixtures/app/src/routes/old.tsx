import { redirect } from '@kerf/start'

// A moved page: the server answers 307, client navigation follows to /todos.
export const load = () => redirect('/todos')

export default function Old() {
  return <p>never rendered</p>
}
