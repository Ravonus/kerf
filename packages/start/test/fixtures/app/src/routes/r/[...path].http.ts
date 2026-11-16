import type { HttpHandler } from '@kerf-js/start/server'

export const GET: HttpHandler = (_, { params }) => Response.json(params)
