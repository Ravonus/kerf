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

export const later = <T,>(ms: number, v: T) => new Promise<T>(ok => setTimeout(ok, ms, v))
