import { dbChanges, realtime } from '@weft-js/start'
import { postgresBus } from '@weft-js/start/bus/postgres'
import { db } from './db'
import { notes } from './schema'

// Writes to `notes` from anywhere reach `.live()`. `LISTEN_URL`: the app is behind a pooler, and the listener can't be.
export default realtime({
  bus: process.env.DATABASE_URL?.startsWith('postgres') ? postgresBus({ url: process.env.DATABASE_URL }) : undefined,
  changes: dbChanges(db, [notes], { listenUrl: process.env.LISTEN_URL, listener: process.env.LISTENER === 'external' ? 'external' : undefined }),
})
