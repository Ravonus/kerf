import { start } from '@kerf/start/client'
import * as routes from 'virtual:kerf/routes'

start(routes as any, { eager: true })
