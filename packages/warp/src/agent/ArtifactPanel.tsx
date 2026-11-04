import { CopyIcon, ExternalIcon } from '@weft-js/warp-icons'
import { announce, copyConfirm, indicator, nextIndex, uid } from '@weft-js/warp-core'
import { derived, state, untrack, type State } from '@weft-js/core'
import { Badge } from '../Badge'
import { use } from '@weft-js/warp-core/weft'
import { IconButton, held, Sweep, useSweep } from './bits'
import '../styles'
import '@weft-js/warp-core/styles/components/tabs.css'
import '@weft-js/warp-core/styles/app/artifact.css'
import '@weft-js/warp-core/styles/app/versions.css'

/** One saved version of an artifact. */
export type ArtifactVersion = {
  id: string
  label: string
  meta?: string | undefined
  code?: string
  named?: boolean
}
const VIEWS = ['Preview', 'Code', 'Versions'] as const

/**
 * ArtifactPanel (07 §6.4): title, version badge, Copy; APG tabs Preview, Code, Versions. Versions is a listbox with a
 * roving tab stop, selection following focus; picking one is `onVersion`, and Code shows that version's code. Copy
 * confirms the panel's sweep. It fills its container, so a rail, a Sheet or a full route all hold it.
 */
export function ArtifactPanel({
  title,
  versions,
  version,
  onVersion,
  code,
  onOpen,
  children,
}: {
  title: unknown
  versions: ArtifactVersion[]
  version?: string | State<string | undefined> | undefined
  onVersion?: (id: string) => void
  code?: string
  onOpen?: () => void
  children?: unknown
}) {
  const id = uid('art')
  const view = state<(typeof VIEWS)[number]>('Preview')
  const picked = held<string | undefined>(
    () => version,
    untrack(() => versions[0]?.id),
    () => (v: string | undefined) => onVersion?.(v!),
  )
  const current = derived(() => versions.find((v) => v.id === picked.value) ?? versions[0])
  const source = derived(() => current.value?.code ?? code ?? '')
  const badge = derived(() => current.value?.label.split(' ·')[0])
  let root: HTMLElement | undefined
  let list: HTMLElement | undefined
  useSweep()
  use(
    indicator,
    () => list,
    () => ({ selected: '[aria-selected="true"]', x: '--_ix', w: '--_iw', at: view.value }),
  )
  const go = (v: (typeof VIEWS)[number]) => (view.value = v)
  const onTab = (e: KeyboardEvent) => {
    const to = nextIndex(e.key, VIEWS.indexOf(view.value), VIEWS.length, {
      rtl: getComputedStyle(e.currentTarget as Element).direction === 'rtl',
    })
    if (to < 0) return
    e.preventDefault()
    go(VIEWS[to]!)
    list!.querySelectorAll<HTMLElement>('[role="tab"]')[to]?.focus()
  }
  const choose = (v: ArtifactVersion) => {
    picked.set(v.id)
    announce(root!.ownerDocument, `Previewing ${v.label}`)
    queueMicrotask(() =>
      root!
        .querySelectorAll<HTMLElement>('[role="option"]')
        [versions.findIndex((x) => x.id === v.id)]?.focus(),
    )
  }
  const onList = (e: KeyboardEvent) => {
    const at = versions.findIndex((v) => v.id === current.value?.id)
    const to = nextIndex(e.key, at, versions.length, { orientation: 'vertical' })
    if (to < 0) return
    e.preventDefault()
    choose(versions[to]!)
  }
  return (
    <section
      ref={(n) => (root = n)}
      data-scope="artifact"
      data-sweep=""
      aria-labelledby={`${id}-n`}
    >
      <Sweep />
      <div data-part="head">
        <b id={`${id}-n`}>{title}</b>
        {badge.value !== undefined && <Badge tone="neutral">{badge.value}</Badge>}
        <IconButton
          icon={CopyIcon}
          label="Copy"
          onClick={(e: Event) => copyConfirm(e.currentTarget as Element, source.value, root)}
        />
        {onOpen && <IconButton icon={ExternalIcon} label="Open in editor" onClick={onOpen} />}
      </div>
      <div data-scope="tabs" data-part="root" style="padding:8px 12px 0;gap:0">
        <div
          ref={(n) => (list = n)}
          data-part="list"
          role="tablist"
          aria-label="Artifact views"
          onKeyDown={onTab}
        >
          {VIEWS.map((v, i) => (
            <button
              key={v}
              data-part="trigger"
              role="tab"
              type="button"
              id={`${id}-t${i}`}
              aria-controls={`${id}-p${i}`}
              aria-selected={v === view.value ? 'true' : 'false'}
              tabindex={v === view.value ? undefined : '-1'}
              onClick={() => go(v)}
            >
              {v}
            </button>
          ))}
          <span data-part="indicator" aria-hidden="true" data-instant=""></span>
        </div>
      </div>
      <div
        data-part="panel"
        role="tabpanel"
        id={`${id}-p0`}
        aria-labelledby={`${id}-t0`}
        tabindex="0"
        hidden={view.value !== 'Preview'}
      >
        <div data-part="preview">{children}</div>
      </div>
      <div
        data-part="panel"
        role="tabpanel"
        id={`${id}-p1`}
        aria-labelledby={`${id}-t1`}
        tabindex="0"
        hidden={view.value !== 'Code'}
      >
        <pre>{source.value}</pre>
      </div>
      <div
        data-part="panel"
        role="tabpanel"
        id={`${id}-p2`}
        aria-labelledby={`${id}-t2`}
        hidden={view.value !== 'Versions'}
      >
        <ol data-scope="versions" role="listbox" aria-label="Versions" onKeyDown={onList}>
          {versions.map((v) => (
            <li
              key={v.id}
              id={`${id}-v-${v.id}`}
              role="option"
              aria-selected={v.id === current.value?.id ? 'true' : 'false'}
              aria-current={v.id === current.value?.id ? 'true' : undefined}
              tabindex={v.id === current.value?.id ? '0' : '-1'}
              data-named={(v.named ?? v.id === current.value?.id) ? '' : undefined}
              onClick={() => choose(v)}
            >
              <i></i>
              <span>
                {v.label}
                {v.meta !== undefined && <small>{v.meta}</small>}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
