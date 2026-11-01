export const CHANNEL: string
export const LOG: string
export const MAX_IDS: number
export const LOG_ROWS: number
export const BREAK: string
export function changeStatements(dialect: string, tables: readonly { name: string }[]): string[]
export function changeSql(dialect: string, tables: readonly { name: string }[]): string
