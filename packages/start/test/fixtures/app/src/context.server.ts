// The app's part of `ctx` (research 27 §1): the plug for a database client and the signed-in user.
import { todos } from './db'

export default ({ request }: { request: Request }) => ({ db: todos, who: request.headers.get('x-user') })

declare module '@weft/start' {
  interface Context {
    db: typeof todos
    who: string | null
  }
}
