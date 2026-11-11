import { createDb as postgres } from '@kerf-js/start/db/postgres'
import { createDb as sqlite } from '@kerf-js/start/db/sqlite'
import { notes } from './schema'

const url = process.env.DATABASE_URL ?? 'file:.data/live.db'
export const db: any = url.startsWith('postgres')
  ? postgres({ schema: { notes }, url, migrate: false })
  : sqlite({ schema: { notes }, url, migrate: false })
