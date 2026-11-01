import { start } from '@weft/start/client'
import * as routes from 'virtual:weft/routes'

start(routes as any, { eager: true })
