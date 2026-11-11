import { AlertCircleIcon, UploadIcon } from '@kerf-js/veneer-icons'
import {
  announce,
  badRows,
  checkImport,
  missingTargets,
  plural,
  SKIP_COLUMN,
  uid,
  type CsvTable,
  type ImportIssue,
  type ImportTarget,
} from '@kerf-js/veneer-core'
import { derived, state, untrack } from '@kerf-js/core'
import { Alert } from '../Alert'
import { Button } from '../Button'
import { Progress } from '../Progress'
import { PlainTable } from './PlainTable'
import { csvLoading, csvPreview, csvRun, type Stage } from './CsvImport-actions'
import { StepBar } from './StepBar'
import { InlineSelect, Sweep, afterFlush } from './atoms'
import '../styles'
import '@kerf-js/veneer-core/styles/flows/tokens.css'
import '@kerf-js/veneer-core/styles/flows/base.css'
import '@kerf-js/veneer-core/styles/rich/helpers.css'
import '@kerf-js/veneer-core/styles/layout/tokens.css'
import '@kerf-js/veneer-core/styles/layout/row.css'
import '@kerf-js/veneer-core/styles/layout/stack.css'
import '@kerf-js/veneer-core/styles/inputs/field.css'
import '@kerf-js/veneer-core/styles/inputs/file.css'
import '@kerf-js/veneer-core/styles/flows/import-map.css'
import '@kerf-js/veneer-core/styles/flows/import-preview.css'

/** Props for CsvImport. */
export interface CsvImportProps {
  targets: ImportTarget[]
  noun?: [one: string, many: string]
  rowLimit?: number
  /** "Use the sample": a name and its text. */
  sample?: { name: string; text: string }
  /** Runs the import; report progress from 0 to 100. The job is the server's: leaving the page is fine. */
  onImport: (
    records: Record<string, string>[],
    progress: (percent: number) => void,
  ) => Promise<void>
}

const STEPS = [
  { id: 'upload', title: 'Upload' },
  { id: 'map', title: 'Map' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Import' },
]
const SAY: Record<Stage, string> = {
  upload: 'upload',
  map: 'map columns',
  review: 'review',
  done: 'importing',
}
const ORDER: Stage[] = ['upload', 'map', 'review', 'done']

type CsvRefs = { headingElement?: HTMLElement | undefined }

function announceCsvStep(refs: CsvRefs, s: Stage) {
  if (refs.headingElement)
    announce(
      refs.headingElement.ownerDocument,
      `Import, step ${ORDER.indexOf(s) + 1} of 4, ${SAY[s]}`,
    )
}

function csvModel(props: CsvImportProps) {
  const refs: CsvRefs = {}
  const id = uid('csv')
  const stage = state<Stage>('upload')
  const file = state('')
  const table = state<CsvTable>({ headers: [], rows: [] })
  const map = state<string[]>([])
  const percent = state(0)
  const finished = state(false)
  const dragging = state(false)
  const issue = state('')

  const at = derived(() => ORDER.indexOf(stage.value))
  const options = derived(() => [
    ...props.targets.map((t) => ({ value: t.id, label: t.label })),
    { value: SKIP_COLUMN, label: 'Don’t import' },
  ])
  const missing = derived(() => missingTargets(map.value, props.targets))
  const issues = derived<ImportIssue[]>(() =>
    checkImport(table.value.rows, map.value, props.targets),
  )
  const bad = derived(() => badRows(issues.value))
  const good = derived(() => (missing.value.length ? 0 : table.value.rows.length - bad.value))
  const count = (n: number) =>
    plural(
      n,
      (props.noun === undefined ? (['person', 'people'] as const) : props.noun)[0],
      (props.noun === undefined ? (['person', 'people'] as const) : props.noun)[1],
    )
  const go = (next: Stage) => {
    stage.value = next
    announceCsvStep(refs, next)
    afterFlush(() => refs.headingElement?.focus())
  }
  const { load, take } = csvLoading({ props, table, map, file, issue, go })
  const run = csvRun({ props, table, map, issues, percent, finished, count, go })
  const again = () => {
    table.value = { headers: [], rows: [] }
    map.value = []
    file.value = ''
    go('upload')
  }
  const { cellIssue, preview, columns, kept, titleOf } = csvPreview({ props, table, map, issues })

  return {
    refs,
    id,
    stage,
    file,
    table,
    map,
    percent,
    finished,
    dragState: dragging,
    issue,
    at,
    options,
    missing,
    issues,
    bad,
    good,
    countText: count,
    go,
    load,
    take,
    run,
    again,
    cellIssue,
    preview,
    columns,
    kept,
    titleOf,
  }
}

function csvUpload(props: CsvImportProps, model: ReturnType<typeof csvModel>) {
  const { id, dragState: dragging, take, issue, load } = model
  const rowLimit = () => (props.rowLimit === undefined ? 5000 : props.rowLimit)
  return (
    <>
      <div
        data-scope="dropzone"
        data-sweep=""
        data-pin={dragging.value ? '' : undefined}
        onDragOver={(e: DragEvent) => {
          e.preventDefault()
          dragging.value = true
        }}
        onDragLeave={() => (dragging.value = false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault()
          dragging.value = false
          void take(e.dataTransfer?.files[0])
        }}
      >
        <Sweep />
        <input
          type="file"
          accept=".csv,text/csv"
          aria-labelledby={`${id}-t`}
          aria-describedby={`${id}-h`}
          onChange={(e: Event) => {
            void take((e.currentTarget as HTMLInputElement).files?.[0])
            ;(e.currentTarget as HTMLInputElement).value = ''
          }}
        />
        <span data-part="icon" aria-hidden="true">
          <UploadIcon />
        </span>
        <span data-part="drop-copy">
          <span data-part="title" id={`${id}-t`}>
            Drop a CSV here or <u>browse</u>
          </span>
        </span>
        <span data-part="hint" id={`${id}-h`}>
          Up to {rowLimit().toLocaleString('en-US')} rows · first row is the header
        </span>
      </div>
      {issue.value && (
        <Alert tone="critical" live title="That file can’t be read">
          {issue.value}
        </Alert>
      )}
      {props.sample && (
        <div>
          <Button emphasis="link" onClick={() => load(props.sample!.name, props.sample!.text)}>
            Use the sample
          </Button>
        </div>
      )}
    </>
  )
}

function csvMapping(model: ReturnType<typeof csvModel>) {
  const { file, table, columns, map, options } = model
  return (
    <>
      <span class="muted">
        <b>{file.value}</b> · {plural(table.value.rows.length, 'row')} ·{' '}
        {plural(table.value.headers.length, 'column')}
      </span>
      <PlainTable
        label="Column mapping"
        scope="import-map"
        caption="Map each CSV column to a field"
        head={
          <tr>
            <th scope="col">CSV column</th>
            <th scope="col">Sample</th>
            <th scope="col">Imports as</th>
          </tr>
        }
      >
        {columns.value.map((c) => (
          <tr key={c.h}>
            <th scope="row">
              <code>{c.h}</code>
            </th>
            <td class="muted">{table.value.rows[0]?.[c.col]}</td>
            <td>
              <InlineSelect
                label={`${c.h} imports as`}
                value={c.target!}
                options={options.value}
                onValueChange={(v) => {
                  const next = [...map.value]
                  next[c.col] = v
                  map.value = next
                }}
              />
            </td>
          </tr>
        ))}
      </PlainTable>
    </>
  )
}

function csvReview(model: ReturnType<typeof csvModel>) {
  const { missing, bad, table, good, kept, titleOf, preview, issues, cellIssue } = model
  return (
    <>
      {missing.value.length > 0 ? (
        <Alert
          tone="critical"
          title={`No column is mapped to ${missing.value.map((t) => t.label).join(', ')}`}
        >
          Go back and map one to continue.
        </Alert>
      ) : bad.value > 0 ? (
        <Alert
          tone="caution"
          title={`${bad.value} of ${plural(table.value.rows.length, 'row')} need a fix`}
        >
          Fix them in the file and upload again, or import the {good.value} good rows now and skip
          the rest.
        </Alert>
      ) : (
        <Alert tone="positive" title={`All ${plural(table.value.rows.length, 'row')} look good`} />
      )}
      <PlainTable
        label="Import preview"
        scope="import-preview"
        caption="Preview of the first rows"
        head={
          <tr>
            {kept.value.map((c) => (
              <th key={c.h} scope="col">
                {titleOf(c.target!)}
              </th>
            ))}
          </tr>
        }
      >
        {preview.value.map((r) => (
          <tr key={r.row} data-invalid={issues.value.some((x) => x.row === r.row) ? '' : undefined}>
            {kept.value.map((c) => (
              <Cell key={c.h} value={r.cells[c.col]!} issue={cellIssue(r.row, c.target!)} />
            ))}
          </tr>
        ))}
      </PlainTable>
    </>
  )
}

function csvDone(model: ReturnType<typeof csvModel>) {
  const { finished, percent, countText: count, good, again } = model
  return (
    <>
      <Progress label={finished.value ? 'Imported' : 'Importing'} value={percent.value} />
      {finished.value ? (
        <div data-scope="row">
          <span>{count(good.value)} imported.</span>
          <Button emphasis="link" onClick={again}>
            Import another file
          </Button>
        </div>
      ) : (
        <span class="muted">You can leave this page; we’ll email you when it finishes.</span>
      )}
    </>
  )
}

function csvNavigation(model: ReturnType<typeof csvModel>) {
  const { stage, go, good, run } = model
  return (
    <div data-scope="row" data-justify="between">
      <Button
        emphasis="ghost"
        tone="neutral"
        onClick={() => go(stage.value === 'map' ? 'upload' : 'map')}
      >
        Back
      </Button>
      {stage.value === 'map' ? (
        <Button onClick={() => go('review')}>Preview</Button>
      ) : (
        <Button
          disabled={good.value === 0}
          onClick={run}
        >{`Import ${plural(good.value, 'row')}`}</Button>
      )}
    </div>
  )
}

function csvView(props: CsvImportProps, model: ReturnType<typeof csvModel>) {
  const { refs, stage, at } = model
  return (
    <div data-scope="stack">
      <StepBar label="Import progress" steps={STEPS} current={at.value} />
      <h3 ref={(n) => (refs.headingElement = n)} data-part="step-title" tabindex="-1">
        {STEPS[at.value]!.title} {(props.noun === undefined ? ['person', 'people'] : props.noun)[1]}
      </h3>
      {stage.value === 'upload' && csvUpload(props, model)}
      {stage.value === 'map' && csvMapping(model)}
      {stage.value === 'review' && csvReview(model)}
      {stage.value === 'done' && csvDone(model)}
      {(stage.value === 'map' || stage.value === 'review') && csvNavigation(model)}
    </div>
  )
}

/**
 * The CSV import wizard (09 §4.7), Upload → Map → Review → Import: parsing, mapping and validation are veneer-core's. Each
 * step's heading takes focus. Bad cells say why inline; a required target with no column is reported once.
 */
export function CsvImport(props: CsvImportProps) {
  const live = untrack(() => props)
  return csvView(live, csvModel(live))
}

function Cell({ value, issue }: { value: string; issue?: ImportIssue | undefined }) {
  return (
    <td data-invalid={issue ? '' : undefined}>
      {value}
      {issue && (
        <span data-part="error">
          <AlertCircleIcon />
          {issue.message}
        </span>
      )}
    </td>
  )
}
