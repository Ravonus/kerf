// CSV loading and import actions.
import {
  autoMap,
  importRecords,
  isCsvFile,
  parseCsv,
  SKIP_COLUMN,
  type CsvTable,
  type ImportIssue,
} from '@kerf-js/veneer-core'
import { derived, type State } from '@kerf-js/core'
import { toast } from '../Toast'
import type { CsvImportProps } from './CsvImport'

export type Stage = 'upload' | 'map' | 'review' | 'done'

const PREVIEW_ROWS = 50

export function csvPreview({
  props,
  table,
  map,
  issues,
}: {
  props: CsvImportProps
  table: State<CsvTable>
  map: State<string[]>
  issues: { readonly value: ImportIssue[] }
}) {
  const cellIssue = (row: number, target: string) =>
    issues.value.find((x) => x.row === row && x.path === target)
  const preview = derived(() =>
    table.value.rows.slice(0, PREVIEW_ROWS).map((cells, row) => ({ row, cells })),
  )
  const columns = derived(() =>
    table.value.headers.map((h, col) => ({ h, col, target: map.value[col] })),
  )
  const kept = derived(() => columns.value.filter((c) => c.target !== SKIP_COLUMN))
  const titleOf = (target: string) => props.targets.find((t) => t.id === target)?.label ?? target

  return { cellIssue, preview, columns, kept, titleOf }
}

export function csvLoading({
  props,
  table,
  map,
  file,
  issue,
  go,
}: {
  props: CsvImportProps
  table: State<CsvTable>
  map: State<string[]>
  file: State<string>
  issue: State<string>
  go: (next: Stage) => void
}) {
  const load = (name: string, text: string) => {
    const t = parseCsv(text)
    if (t.problem) {
      issue.value = t.problem
      return
    }
    if (t.rows.length > (props.rowLimit === undefined ? 5000 : props.rowLimit)) {
      issue.value = `This file has ${t.rows.length.toLocaleString('en-US')} rows. The limit is ${(props.rowLimit === undefined ? 5000 : props.rowLimit).toLocaleString('en-US')}.`
      return
    }
    issue.value = ''
    file.value = name
    table.value = t
    map.value = autoMap(t.headers, props.targets)
    go('map')
  }
  const take = async (f?: File | null) => {
    if (!f) return
    if (!isCsvFile(f.name, f.type))
      return void toast.show({
        title: 'That isn’t a CSV file',
        description: `${f.name} wasn’t uploaded. Export it as .csv and try again.`,
        tone: 'critical',
      })
    load(f.name, await f.text())
  }
  return { load, take }
}

export function csvRun({
  props,
  table,
  map,
  issues,
  percent,
  finished,
  count,
  go,
}: {
  props: CsvImportProps
  table: State<CsvTable>
  map: State<string[]>
  issues: { readonly value: ImportIssue[] }
  percent: State<number>
  finished: State<boolean>
  count: (n: number) => string
  go: (next: Stage) => void
}) {
  const run = async () => {
    const records = importRecords(table.value.rows, map.value, issues.value)
    go('done')
    percent.value = 0
    finished.value = false
    try {
      await props.onImport(records, (p) => (percent.value = p))
      percent.value = 100
      finished.value = true
      toast.show({
        title: `${count(records.length)} imported`,
        description: 'They’ll get an invite email.',
        tone: 'positive',
      })
    } catch {
      toast.show({
        title: 'The import stopped',
        description: 'Nothing was lost. Try again.',
        tone: 'critical',
        action: { label: 'Retry', onClick: run },
      })
    }
  }
  return run
}
