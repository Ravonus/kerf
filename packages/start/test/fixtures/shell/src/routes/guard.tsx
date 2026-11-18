import { routeRedirect } from '@kerf-js/start'
import { z } from 'zod'
import type { destinations } from '../redirects'

export const routeData = { initial: z.null() }
export const load = () => routeRedirect<typeof destinations>('detail', { id: '42' })
