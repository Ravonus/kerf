// Bun's built-in driver has no types on Node, where this package is checked: only what `open` calls.
declare module 'bun:sqlite' {
  /** One open database file. */
  export class Database {
    constructor(path: string, options: { create: boolean })
    prepare(text: string): { run(...params: unknown[]): unknown; values(...params: unknown[]): unknown[][] }
    run(text: string): unknown
    close(): void
  }
}
