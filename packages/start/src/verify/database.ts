import postgres from 'postgres'

export function database(db: string | undefined) {
  const sql = db
    ? postgres(db, { max: 3, idle_timeout: 2, connect_timeout: 5, onnotice: () => {} })
    : undefined
  const listener = db
    ? postgres(db, { max: 1, idle_timeout: 2, connect_timeout: 5, onnotice: () => {} })
    : undefined
  return { sql, listener }
}
