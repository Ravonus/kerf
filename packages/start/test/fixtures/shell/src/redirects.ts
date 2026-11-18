import type { RouteRedirects } from '@kerf-js/core/config'

export const destinations = {
  item: '/items/42',
  detail: { path: '/items/:id', params: { id: '[0-9]{1,3}' }, returnTo: 'next' },
} as const satisfies RouteRedirects
