import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '~/env.server'
import * as schema from './schema'

const connect = () => drizzle(postgres(env().DATABASE_URL), { schema })

let cached: ReturnType<typeof connect> | undefined

/** Connects on first use, so pages render with no database running. */
export const db = () => (cached ??= connect())
