// Bun's built-in driver has no types on Node, where this package is checked: only what `open` calls.
declare module 'bun:sqlite' {
  /** One open database file. */
  export class Database {
    constructor(path: string, options: { create: boolean })
    prepare(text: string): { all(...params: unknown[]): Record<string, unknown>[] }
    run(text: string): unknown
  }
}
