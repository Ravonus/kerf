import { uid } from '@kerf-js/veneer-core'
import {
  chart,
  SSR_RADIUS,
  SSR_WIDTH,
  tableHTML,
  toHTML,
  type Ctx,
  type Form,
} from '@kerf-js/veneer-core/charts'
import { derived, untrack } from '@kerf-js/core'
import { use } from '@kerf-js/veneer-core/kerf'
import './styles'
import '@kerf-js/veneer-core/styles/data/tokens.css'
import '@kerf-js/veneer-core/styles/data/base.css'
import '@kerf-js/veneer-core/styles/data/chart.css'
import '@kerf-js/veneer-core/styles/data/legend.css'
import '@kerf-js/veneer-core/styles/data/tooltip.css'

/** What every chart shares around its plot: the caption, the toolbar and the loading, empty and error states. */
export type ChartFrame = {
  title: string
  /** The title's heading level: one below the heading the chart sits under. Default 3, a chart in a page section. */
  level?: 2 | 3 | 4 | 5 | 6
  description?: unknown
  /** Beside the view toggle: a layout switch, a range picker. */
  toolbar?: unknown
  /** Replaces the plot, in the same frame (06 §12). With no data the frame shows `empty` on its own. */
  state?: 'loading' | 'empty' | 'error' | undefined
  loading?: string | undefined
  /** The title and detail shown in place of the plot when there is no data. */
  empty?: { title: string; detail?: unknown } | undefined
  error?: { title: string; detail?: unknown } | undefined
  /** The next step under an empty or error state: a Retry button. */
  action?: unknown
}
type Props<C> = ChartFrame & C & { form: Form<C> }

// props that are the frame's, not a form's: a JSX prop builds its element each time it's read, so these are read once
const FRAME = new Set([
  'form',
  'level',
  'description',
  'toolbar',
  'action',
  'empty',
  'error',
  'loading',
])

const Drawn = ({ stroke }: { stroke: string }) => (
  <svg width="72" height="40" viewBox="0 0 72 40" aria-hidden="true">
    <path d="M8 0V40M22 0V40M36 0V40M50 0V40M64 0V40" stroke="var(--veneer-color-border-strong)" />
    <path
      d={stroke === 'var(--veneer-color-critical-solid)' ? 'M0 20H30' : 'M0 14H72M0 26H72'}
      stroke={stroke}
      stroke-width="2"
    />
  </svg>
)

function Standby({
  state,
  title,
  text,
  action,
}: {
  state: 'loading' | 'empty' | 'error'
  title: string
  text?: { title: string; detail?: unknown } | undefined
  action?: unknown
}) {
  if (untrack(() => state) === 'loading')
    return (
      <div data-part="state" role="status" aria-busy="true">
        <div
          aria-hidden="true"
          style="display:flex;align-items:end;gap:10px;block-size:118px;inline-size:100%;padding-inline:6px"
        >
          {[40, 70, 55, 90, 64, 80, 96].map((h) => (
            <span key={h} data-part="skeleton" style={`--h:${h}px`}></span>
          ))}
        </div>
        {text?.title ?? `Loading ${title}…`}
      </div>
    )
  const failed = untrack(() => state) === 'error'
  return (
    <div data-part="state" role={failed ? 'alert' : 'status'}>
      <Drawn
        stroke={failed ? 'var(--veneer-color-critical-solid)' : 'var(--veneer-color-accent-solid)'}
      />
      <b style="color:var(--veneer-color-text)">
        {text?.title ?? (failed ? `Couldn’t load ${title}` : `No ${title}`)}
      </b>
      {text?.detail}
      {action}
    </div>
  )
}

function Ready<C>(p: {
  form: Form<C>
  cfg: () => C
  id: string
  root: () => HTMLElement | undefined
}) {
  const id = () => p.id
  // the first layout, once: from here on `chart` owns these nodes, so nothing below re-renders them
  const first = derived(() =>
    untrack(() =>
      p.form.plot(p.cfg(), SSR_WIDTH, { id: p.id, hidden: new Set(), r: SSR_RADIUS } satisfies Ctx),
    ),
  )
  const legend = derived(() => p.form.legend?.(p.cfg()) ?? [])
  const table = derived(() => tableHTML(p.form.table(p.cfg())))
  const summary = derived(() => {
    const c = p.cfg() as C & { summary?: string | ((c: C) => string) | undefined }
    return typeof c.summary === 'function' ? c.summary(c) : (c.summary ?? p.form.summary(c))
  })
  use(
    chart<C>,
    () => p.root(),
    () => ({ form: p.form, cfg: p.cfg(), id: p.id }),
  )
  return (
    <>
      {chartLegend(() => p.form, legend)}
      <div data-part="plot">
        <div data-scope="tooltip" data-part="chart-tip" aria-hidden="true"></div>
        <svg
          data-part="svg"
          viewBox={`0 0 ${first.value.w ?? SSR_WIDTH} ${first.value.h}`}
          width={first.value.w ?? SSR_WIDTH}
          height={first.value.h}
          style={first.value.style}
          role="group"
          aria-roledescription={p.form.kind}
          aria-labelledby={`${id()}-t`}
          aria-describedby={`${id()}-s`}
          // oxlint-disable-next-line kerf/no-html-sink -- toHTML escapes every text and attribute of the scene
          innerHTML={toHTML(first.value.body)}
        ></svg>
      </div>
      <div
        data-part="table"
        tabindex="0"
        role="region"
        aria-labelledby={`${id()}-t`}
        // oxlint-disable-next-line kerf/no-html-sink -- tableHTML escapes every cell
        innerHTML={table.value}
      ></div>
      <p data-part="summary" id={`${id()}-s`}>
        {summary.value}
      </p>
    </>
  )
}

function chartLegend<C>(
  form: () => Form<C>,
  legend: { value: NonNullable<ReturnType<NonNullable<Form<C>['legend']>>> },
) {
  return (
    <>
      {form().ramp !== undefined ? (
        <ul data-scope="legend" aria-label="Scale">
          <li style="display:flex;align-items:center;gap:6px;font-size:var(--veneer-text-caption-size);color:var(--veneer-color-text-subtle);padding-inline:6px">
            Fewer{' '}
            {[0, 1, 2, 3, 4, 5].slice(form().ramp).map((b) => (
              <i
                key={b}
                style={`display:inline-block;inline-size:11px;block-size:11px;border-radius:2px;background:var(--veneer-color-data-seq-${b})`}
              ></i>
            ))}{' '}
            More
          </li>
        </ul>
      ) : (
        legend.value.length > 0 && (
          <ul data-scope="legend" aria-label="Series">
            {legend.value.map((s, i) => (
              <li key={s.name}>
                <button type="button" aria-pressed="true" data-si={i} style={`--_dc:${s.color}`}>
                  <i data-shape={form().swatch ?? 'box'}></i>
                  {s.name}
                  {s.value !== undefined && (
                    <>
                      {' '}
                      <b>{s.value}</b>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </>
  )
}

/**
 * The frame every chart shares (06 §12): figure > head · legend · plot (svg, tooltip) · table · summary. The plot is
 * laid out once here, so the server sends a whole chart, and from then on veneer-core's `chart` owns it: width and data
 * changes rewrite attributes on the same nodes, and the legend and the view toggle are delegated from the figure.
 */
export function Chart<C extends { data: unknown; title: string }>(props: Props<C>) {
  const id = uid('chart')
  let figure: HTMLElement | undefined
  const cfg = () => {
    const c: Record<string, unknown> = {}
    for (const k of Object.keys(props))
      if (!FRAME.has(k)) c[k] = (props as Record<string, unknown>)[k]
    return c as C
  }
  const hasData = () => {
    const d = props.data
    return d !== undefined && d !== null && (!Array.isArray(d) || d.length > 0)
  }
  const status = () => props.state ?? (hasData() ? undefined : 'empty')
  return (
    <figure ref={(n) => (figure = n)} data-scope="chart" data-view="chart" data-enter="wait">
      <div data-part="head">
        <div>
          <h3
            id={`${id}-t`}
            aria-level={props.level === 3 ? undefined : props.level}
            style="margin:0;font-family:var(--veneer-text-heading-font);font-size:calc(var(--veneer-text-heading-size) - 3px);font-weight:var(--veneer-text-heading-weight);letter-spacing:var(--veneer-text-heading-tracking)"
          >
            {props.title}
          </h3>
          {props.description !== undefined && (
            <p style="margin:2px 0 0;font-size:var(--veneer-text-caption-size);color:var(--veneer-color-text-subtle)">
              {props.description}
            </p>
          )}
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
          {props.toolbar}
          {status() === undefined && (
            <div data-part="view-toggle" role="group" aria-label="View">
              <button type="button" aria-pressed="true" data-view="chart" aria-label="Chart view">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
                  <path d="M2 13.5h12M3.5 10.5l3-3.5 2.5 2 3.5-4.5" />
                </svg>
              </button>
              <button type="button" aria-pressed="false" data-view="table" aria-label="Table view">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16">
                  <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
                  <path d="M2 6.5h12M2 10h12M6.5 6.5v7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
      {status() === undefined ? (
        <Ready form={props.form} cfg={cfg} id={id} root={() => figure} />
      ) : (
        <Standby
          state={status()!}
          title={props.title}
          text={
            status() === 'loading'
              ? props.loading === undefined
                ? undefined
                : { title: props.loading }
              : status() === 'error'
                ? props.error
                : props.empty
          }
          action={props.action}
        />
      )}
    </figure>
  )
}
