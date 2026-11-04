export const filters = ['all', 'active', 'done'] as const
export type Filter = (typeof filters)[number]

export const parseFilter = (value: unknown): Filter =>
  (filters as readonly unknown[]).includes(value) ? (value as Filter) : 'all'
