import { createDb } from '@weft-js/start/db/sqlite'
import { env } from '../env.server'
import * as schema from './schema'

export const db = createDb({ schema, url: env.DATABASE_URL })
