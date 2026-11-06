import { session } from '@weft-js/start/auth'
import auth from '#/auth.server'
import { db } from '#/db/index.server'

export default async ({ request }: { request: Request }) => ({
  db,
  ...(await session(auth, request)),
})

type Session = Awaited<ReturnType<typeof auth.session>>

declare module '@weft-js/start' {
  interface Context {
    db: typeof db
    user: Session['user']
    session: Session['session']
  }
}
