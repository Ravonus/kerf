import { basename } from 'node:path'
import type { HttpHandler } from '@kerf-js/start/server'

export const POST: HttpHandler = async (request, { params }) =>
  Response.json({
    id: basename(params.id!),
    body: await request.json(),
    hook: request.headers.get('x-endpoint-hook'),
  })
