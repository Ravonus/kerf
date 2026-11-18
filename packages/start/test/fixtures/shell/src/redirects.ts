import type { RouteRedirects } from '@kerf-js/core/config'

export const destinations = {
  startGuard: '/guard',
  item: '/items/42',
  broad: { path: '/items/:id', params: { id: '.{1,256}' }, returnTo: 'next' },
  detail: { path: '/items/:id', params: { id: '[0-9]{1,3}' }, returnTo: 'next' },
} as const satisfies RouteRedirects
