// CSV import parsing and validation.
/* ---- CSV import (09 §4.7) ---- */

/** A parsed CSV: its headers and rows, and what's wrong with it if it can't be read. */
export interface CsvTable {
  headers: string[]
  rows: string[][]
  problem?: string | undefined
}
/** A field an import can map a column to, with the aliases that auto-match it and its own value check. */
export interface ImportTarget {
  id: string
  label: string
  required?: boolean
  aliases?: string[]
  check?: (value: string) => string | undefined
}
/** One problem found in an imported row. */
export interface ImportIssue {
  row: number
  path: string
  message: string
}
/** The mapping value for a column the import leaves out. */
export const SKIP_COLUMN = 'skip'

/** Whether a picked file is a CSV, by name or by type. */
export const isCsvFile = (name: string, type = '') => /\.csv$/i.test(name) || type === 'text/csv'

const sniff = (line: string) => {
  const count = (d: string) => line.split(d).length
  return [',', ';', '\t'].reduce((best, d) => (count(d) > count(best) ? d : best), ',')
}

/**
 * RFC 4180: quoted fields, doubled quotes, line breaks inside quotes, CRLF, a BOM. The delimiter is the one that splits
 * the first line most (comma, semicolon or tab). Blank lines go; a short row pads, so every row has the header's width.
 */
export function parseCsv(input: string, delimiter?: string): CsvTable {
  const text = input.replace(/^﻿/, '')
  const d = delimiter ?? sniff(text.slice(0, text.search(/\r?\n|$/)))
  const grid: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  const endCell = () => {
    row.push(cell)
    cell = ''
  }
  const endRow = () => {
    endCell()
    if (row.some((c) => c !== '')) grid.push(row)
    row = []
  }
  while (i < text.length) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i += 2
        continue
      }
      if (c === '"') quoted = false
      else cell += c
      i++
    } else if (c === '"' && cell === '') {
      quoted = true
      i++
    } else if (c === d) {
      endCell()
      i++
    } else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
      endRow()
      i += c === '\r' ? 2 : 1
    } else {
      cell += c
      i++
    }
  }
  const open = quoted
  if (cell !== '' || row.length) endRow()
  const [headers = [], ...rest] = grid
  const names = headers.map((h) => h.trim())
  return {
    headers: names,
    rows: rest.map((r) => names.map((_, at) => (r[at] ?? '').trim())),
    problem: open
      ? 'A quote in this file never closes.'
      : !names.length
        ? 'This file is empty.'
        : undefined,
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Columns pre-mapped by header name or alias; each target takes the first column that claims it; the rest skip. */
export function autoMap(headers: readonly string[], targets: readonly ImportTarget[]) {
  const taken = new Set<string>()
  return headers.map((h) => {
    const key = norm(h)
    const t = targets.find(
      (x) => !taken.has(x.id) && [x.id, x.label, ...(x.aliases ?? [])].some((n) => norm(n) === key),
    )
    if (t) taken.add(t.id)
    return t?.id ?? SKIP_COLUMN
  })
}

/** The required targets no column maps to: reported once, not per row. */
export const missingTargets = (map: readonly string[], targets: readonly ImportTarget[]) =>
  targets.filter((t) => t.required && !map.includes(t.id))

/** Every cell's problem, same shape as the server's `{ row, path, message }[]`, so the preview and the import can't disagree. */
export function checkImport(
  rows: readonly string[][],
  map: readonly string[],
  targets: readonly ImportTarget[],
) {
  const issues: ImportIssue[] = []
  rows.forEach((r, row) =>
    map.forEach((id, col) => {
      const t = targets.find((x) => x.id === id)
      if (!t) return
      const v = r[col] ?? ''
      const message = !v && t.required ? `${t.label} is required` : v ? t.check?.(v) : undefined
      if (message) issues.push({ row, path: id, message })
    }),
  )
  return issues
}

/** How many distinct rows have at least one issue. */
export const badRows = (issues: readonly ImportIssue[]) => new Set(issues.map((i) => i.row)).size

/** The good rows as records keyed by target; skipped columns go. */
export function importRecords(
  rows: readonly string[][],
  map: readonly string[],
  issues: readonly ImportIssue[],
) {
  const bad = new Set(issues.map((i) => i.row))
  return rows
    .filter((_, i) => !bad.has(i))
    .map(
      (r) =>
        Object.fromEntries(
          map.flatMap((id, col) => (id === SKIP_COLUMN ? [] : [[id, r[col] ?? '']])),
        ) as Record<string, string>,
    )
}
