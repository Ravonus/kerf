import { query } from '@kerf-js/start'
import { z } from 'zod'

export const message = query({ output: z.string(), run: () => 'Release message A' })
