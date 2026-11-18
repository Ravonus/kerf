import { routeRedirect } from '@kerf-js/start'

export function load() {
  return routeRedirect<'item'>('item')
}

export default function Alias() {
  throw new Error('The alias must resolve before its view is mounted')
}
