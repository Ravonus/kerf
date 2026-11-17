import type { HandlerOptions } from './server/types'
export const LAYER_ORDER: string
export const FIRST_PAINT_BYTES: number
export const INLINE_CSS_MAX: number
export const LATE_SHEETS: string
export const LATE_SHEETS_KEPT: string
export const REFUSED_SHEETS: string
export function sheetId(href: string): string
export function keptSheets(cookie: string | null): Set<string> | undefined
export interface PageStyles {
  head: string
  split: boolean
  links: boolean
  found(): Set<string>
  late(sheets?: { href: string }[], chunk?: string): string
}
export function pageStyles(
  assets: NonNullable<HandlerOptions['assets']>,
  css?: { href: string }[],
  html?: string,
  extra?: {
    head?: string
    seen?: { split: boolean; found: Set<string> }
    have?: Set<string>
    keep?: boolean
  },
): PageStyles
