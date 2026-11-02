// The app's part of `ctx` (research 27 §1): the plug for a database client and the signed-in user.
import { todos } from './db'

export default ({ request }: { request: Request }) => {
  const user = /(?:^|; )who=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1]
  return { db: todos, who: request.headers.get('x-user'), ...(user && { user: { id: user } }) }
}

declare module '@weft-js/start' {
  interface Context {
    db: typeof todos
    who: string | null
    user?: { id: string }
  }
}
