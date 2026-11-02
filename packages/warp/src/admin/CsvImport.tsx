import { AlertCircleIcon, UploadIcon } from '@weft-js/warp-icons'
import { announce, autoMap, badRows, checkImport, importRecords, isCsvFile, missingTargets, parseCsv, plural, SKIP_COLUMN, uid, type CsvTable, type ImportIssue, type ImportTarget } from '@weft-js/warp-core'
import { derived, state } from '@weft-js/core'
import { Alert } from '../Alert'
import { Button } from '../Button'
import { Progress } from '../Progress'
import { toast } from '../Toast'
import { PlainTable } from './PlainTable'
import { StepBar } from './StepBar'
import { InlineSelect, Sweep, afterFlush } from './atoms'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/inputs/field.css'
import '@weft-js/warp-core/styles/inputs/file.css'
import '@weft-js/warp-core/styles/flows/import-map.css'
import '@weft-js/warp-core/styles/flows/import-preview.css'

/** Props for CsvImport. */
export interface CsvImportProps {
  targets: ImportTarget[]
  noun?: [one: string, many: string]
  rowLimit?: number
  /** "Use the sample": a name and its text. */
  sample?: { name: string; text: string }
  /** Runs the import; report progress from 0 to 100. The job is the server's: leaving the page is fine. */
  onImport: (records: Record<string, string>[], progress: (percent: number) => void) => Promise<void>
}

type Stage = 'upload' | 'map' | 'review' | 'done'
const STEPS = [{ id: 'upload', title: 'Upload' }, { id: 'map', title: 'Map' }, { id: 'review', title: 'Review' }, { id: 'done', title: 'Import' }]
const SAY: Record<Stage, string> = { upload: 'upload', map: 'map columns', review: 'review', done: 'importing' }
const ORDER: Stage[] = ['upload', 'map', 'review', 'done']
const PREVIEW_ROWS = 50

/**
 * The CSV import wizard (09 §4.7), Upload → Map → Review → Import: parsing, mapping and validation are warp-core's. Each
 * step's heading takes focus. Bad cells say why inline; a required target with no column is reported once.
 */
export function CsvImport({ targets, noun = ['person', 'people'], rowLimit = 5000, sample, onImport }: CsvImportProps) {
  const id = uid('csv')
  const stage = state<Stage>('upload')
  const file = state('')
  const table = state<CsvTable>({ headers: [], rows: [] })
  const map = state<string[]>([])
  const percent = state(0)
  const finished = state(false)
  const dragging = state(false)
  const issue = state('')
  let heading: HTMLElement | undefined

  const at = derived(() => ORDER.indexOf(stage.value))
  const options = derived(() => [...targets.map(t => ({ value: t.id, label: t.label })), { value: SKIP_COLUMN, label: 'Don’t import' }])
  const missing = derived(() => missingTargets(map.value, targets))
  const issues = derived<ImportIssue[]>(() => checkImport(table.value.rows, map.value, targets))
  const bad = derived(() => badRows(issues.value))
  const good = derived(() => (missing.value.length ? 0 : table.value.rows.length - bad.value))
  const count = (n: number) => plural(n, noun[0], noun[1])
  const go = (next: Stage) => {
    stage.value = next
    announceStep(next)
    afterFlush(() => heading?.focus())
  }
  const announceStep = (s: Stage) => { if (heading) announce(heading.ownerDocument, `Import, step ${ORDER.indexOf(s) + 1} of 4, ${SAY[s]}`) }
  const load = (name: string, text: string) => {
    const t = parseCsv(text)
    if (t.problem) { issue.value = t.problem; return }
    if (t.rows.length > rowLimit) { issue.value = `This file has ${t.rows.length.toLocaleString('en-US')} rows. The limit is ${rowLimit.toLocaleString('en-US')}.`; return }
    issue.value = ''
    file.value = name
    table.value = t
    map.value = autoMap(t.headers, targets)
    go('map')
  }
  const take = async (f?: File | null) => {
    if (!f) return
    if (!isCsvFile(f.name, f.type)) return void toast.show({ title: 'That isn’t a CSV file', description: `${f.name} wasn’t uploaded. Export it as .csv and try again.`, tone: 'critical' })
    load(f.name, await f.text())
  }
  const run = async () => {
    const records = importRecords(table.value.rows, map.value, issues.value)
    go('done')
    percent.value = 0
    finished.value = false
    try {
      await onImport(records, p => (percent.value = p))
      percent.value = 100
      finished.value = true
      toast.show({ title: `${count(records.length)} imported`, description: 'They’ll get an invite email.', tone: 'positive' })
    } catch {
      toast.show({ title: 'The import stopped', description: 'Nothing was lost. Try again.', tone: 'critical', action: { label: 'Retry', onClick: run } })
    }
  }
  const again = () => { table.value = { headers: [], rows: [] }; map.value = []; file.value = ''; go('upload') }
  const cellIssue = (row: number, target: string) => issues.value.find(x => x.row === row && x.path === target)
  const preview = derived(() => table.value.rows.slice(0, PREVIEW_ROWS).map((cells, row) => ({ row, cells })))
  const columns = derived(() => table.value.headers.map((h, col) => ({ h, col, target: map.value[col] })))
  const kept = derived(() => columns.value.filter(c => c.target !== SKIP_COLUMN))
  const titleOf = (target: string) => targets.find(t => t.id === target)?.label ?? target

  return (
    <div data-scope="stack">
      <StepBar label="Import progress" steps={STEPS} current={at.value} />
      <h3 ref={n => (heading = n)} data-part="step-title" tabindex="-1">{STEPS[at.value]!.title} {noun[1]}</h3>
      {stage.value === 'upload' && (
        <>
          <div data-scope="dropzone" data-sweep="" data-pin={dragging.value ? '' : undefined} onDragOver={(e: DragEvent) => { e.preventDefault(); dragging.value = true }} onDragLeave={() => (dragging.value = false)} onDrop={(e: DragEvent) => { e.preventDefault(); dragging.value = false; void take(e.dataTransfer?.files[0]) }}>
            <Sweep />
            <input type="file" accept=".csv,text/csv" aria-labelledby={`${id}-t`} aria-describedby={`${id}-h`} onChange={(e: Event) => { void take((e.currentTarget as HTMLInputElement).files?.[0]); (e.currentTarget as HTMLInputElement).value = '' }} />
            <span data-part="icon" aria-hidden="true"><UploadIcon /></span>
            <span data-part="drop-copy"><span data-part="title" id={`${id}-t`}>Drop a CSV here or <u>browse</u></span></span>
            <span data-part="hint" id={`${id}-h`}>Up to {rowLimit.toLocaleString('en-US')} rows · first row is the header</span>
          </div>
          {issue.value && <Alert tone="critical" live title="That file can’t be read">{issue.value}</Alert>}
          {sample && <div><Button emphasis="link" onClick={() => load(sample.name, sample.text)}>Use the sample</Button></div>}
        </>
      )}
      {stage.value === 'map' && (
        <>
          <span class="muted"><b>{file.value}</b> · {plural(table.value.rows.length, 'row')} · {plural(table.value.headers.length, 'column')}</span>
          <PlainTable label="Column mapping" scope="import-map" caption="Map each CSV column to a field" head={<tr><th scope="col">CSV column</th><th scope="col">Sample</th><th scope="col">Imports as</th></tr>}>
            {columns.value.map(c => (
              <tr key={c.h}>
                <th scope="row"><code>{c.h}</code></th>
                <td class="muted">{table.value.rows[0]?.[c.col]}</td>
                <td><InlineSelect label={`${c.h} imports as`} value={c.target} options={options.value} onValueChange={v => { const next = [...map.value]; next[c.col] = v; map.value = next }} /></td>
              </tr>
            ))}
          </PlainTable>
        </>
      )}
      {stage.value === 'review' && (
        <>
          {missing.value.length > 0
            ? <Alert tone="critical" title={`No column is mapped to ${missing.value.map(t => t.label).join(', ')}`}>Go back and map one to continue.</Alert>
            : bad.value > 0
              ? <Alert tone="caution" title={`${bad.value} of ${plural(table.value.rows.length, 'row')} need a fix`}>Fix them in the file and upload again, or import the {good.value} good rows now and skip the rest.</Alert>
              : <Alert tone="positive" title={`All ${plural(table.value.rows.length, 'row')} look good`} />}
          <PlainTable label="Import preview" scope="import-preview" caption="Preview of the first rows" head={<tr>{kept.value.map(c => <th key={c.h} scope="col">{titleOf(c.target!)}</th>)}</tr>}>
            {preview.value.map(r => (
              <tr key={r.row} data-invalid={issues.value.some(x => x.row === r.row) ? '' : undefined}>
                {kept.value.map(c => <Cell key={c.h} value={r.cells[c.col]!} issue={cellIssue(r.row, c.target!)} />)}
              </tr>
            ))}
          </PlainTable>
        </>
      )}
      {stage.value === 'done' && (
        <>
          <Progress label={finished.value ? 'Imported' : 'Importing'} value={percent.value} />
          {finished.value
            ? <div data-scope="row"><span>{count(good.value)} imported.</span><Button emphasis="link" onClick={again}>Import another file</Button></div>
            : <span class="muted">You can leave this page; we’ll email you when it finishes.</span>}
        </>
      )}
      {(stage.value === 'map' || stage.value === 'review') && (
        <div data-scope="row" data-justify="between">
          <Button emphasis="ghost" tone="neutral" onClick={() => go(stage.value === 'map' ? 'upload' : 'map')}>Back</Button>
          {stage.value === 'map'
            ? <Button onClick={() => go('review')}>Preview</Button>
            : <Button disabled={good.value === 0} onClick={run}>{`Import ${plural(good.value, 'row')}`}</Button>}
        </div>
      )}
    </div>
  )
}

function Cell({ value, issue }: { value: string; issue?: ImportIssue | undefined }) {
  return <td data-invalid={issue ? '' : undefined}>{value}{issue && <span data-part="error"><AlertCircleIcon />{issue.message}</span>}</td>
}
