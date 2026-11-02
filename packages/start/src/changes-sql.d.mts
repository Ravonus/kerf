/** The NOTIFY channel Postgres triggers send on. */
export const CHANNEL: string
/** The log table SQLite and MySQL triggers write to. */
export const LOG: string
/** More ids than this in one statement is a table-level change. */
export const MAX_IDS: number
/** Rows SQLite's log keeps; a reader further behind pokes every table. */
export const LOG_ROWS: number
/** Between statements of generated SQL, as Drizzle splits them. */
export const BREAK: string
/** The trigger statements for these tables, one by one. */
export function changeStatements(dialect: string, tables: readonly { name: string }[]): string[]
/** The same statements as one migration. */
export function changeSql(dialect: string, tables: readonly { name: string }[]): string
