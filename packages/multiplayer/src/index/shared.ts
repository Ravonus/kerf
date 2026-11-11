import type { Connection } from '@kerf-js/start'

// What `presence` needs of a connection: the `mp.*` names are the fragment's, which a `doc.connect()`'s types don't say.
export type Conn = Pick<Connection<unknown, unknown>, 'status' | 'room' | 'onReset'> & {
  on(name: string, fn: (message: unknown) => void): () => void
  send(name: string, message: unknown): Promise<void>
}
/** One of the fragment's messages, whose shape the server's half decides. */
export const hear = <M>(conn: Pick<Conn, 'on'>, name: string, fn: (message: M) => void) =>
  conn.on(name, fn as (message: unknown) => void)

export const silent = (p: Promise<unknown>) => void p.catch(() => {}) // a volatile message: the next one replaces it
export const isServer = () => typeof document === 'undefined'
