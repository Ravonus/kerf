import { routeRedirect } from '@kerf-js/start'
import { z } from 'zod'

export const routeData = { initial: z.null() }

export function load() {
  return routeRedirect<'item'>('item')
}

export default function Alias() {
  throw new Error('The alias must resolve before its view is mounted')
}
