import { query, mutation } from '@kerf-js/start'
export const read = query({ tags: ['echo'], run: () => 'query' })
export const write = mutation({ invalidates: ['echo'], run: () => 'mutation' })
