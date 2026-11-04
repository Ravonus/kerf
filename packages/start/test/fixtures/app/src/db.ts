// The fixture's "database": a server-only module the route loaders import (the client build must not include it).
export const SERVER_ONLY = 'db-secret-7f3a'

const users: Record<string, { id: string; name: string; bio: string }> = {
  '1': { id: '1', name: 'Ada Lovelace', bio: 'First programmer & "analyst" <of engines>.' },
  '2': { id: '2', name: 'Grace Hopper', bio: 'Compilers, COBOL and nanoseconds.' },
  '42': { id: '42', name: 'Alan Turing', bio: 'Computable numbers.' },
}

export const db = {
  secret: SERVER_ONLY,
  async user(id: string) {
    return users[id]
  },
  async users() {
    return Object.values(users).map(({ id, name }) => ({ id, name }))
  },
}

export const later = <T>(ms: number, v: T) => new Promise<T>((ok) => setTimeout(ok, ms, v))

// Todos for the server-function routes (research 27): mutable, shared by every request of the dev server.
export interface Todo {
  id: string
  title: string
  done: boolean
}
export const todos = {
  list: [
    { id: '1', title: 'Write the note', done: true },
    { id: '2', title: 'Build the cache', done: false },
    { id: '3', title: 'Ship it', done: false },
  ] as Todo[],
  /** How often each query's `run` ran, so tests can see dedupe and the shared cache. */
  runs: { list: 0, stats: 0 },
  next: 4,
}
