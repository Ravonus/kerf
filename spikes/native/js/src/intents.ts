// Intent components: the app says what it means ("pick one of these", "these are the app's sections") and the
// idiom table decides the platform form. App code never names a platform or a screen size. Lowered form, like app.ts.
import { panes, platform, resolve, viewport, type Idiom } from './platform'
import { el, match } from './runtime'

export type Option = { value: string; text: string }

/** Pick one of a few options: a segmented control on iOS, choice chips on Android, warp buttons on web. */
export function Choice(props: { label: string; options: Option[]; selected: () => string; onSelect: (v: string) => void; idiom?: Idiom }) {
  const { render } = resolve('Choice', props.idiom)
  if (render === 'segmented') {
    return el('Choice', {
      label: props.label,
      options: props.options.map(o => o.text).join('\u001f'),
      selected: () => props.options.findIndex(o => o.value === props.selected()),
      onSelect: i => props.onSelect(props.options[Number(i)].value),
    })
  }
  const [on, off] = render === 'chips' ? ['chip-on', 'chip'] : ['accent', 'plain']
  return el('Row', { gap: 'related', label: props.label },
    ...props.options.map(o => el('Button', {
      text: o.text,
      label: o.text,
      tone: () => (props.selected() === o.value ? on : off),
      onTap: () => props.onSelect(o.value),
    })),
  )
}

export type Tab = { value: string; text: () => string; label: string; body: () => number }

/**
 * The app's top-level sections. Where they go depends on the platform and the window, and changes live when the
 * window does (rotate, unfold, resize):
 * - web: tabs in the header;
 * - iOS: a bottom tab bar on iPhones and narrow windows, a sidebar on wide iPad windows;
 * - Android: a bottom navigation bar under 600dp, a navigation rail above it;
 * - across a separating hinge (Surface Duo, a foldable in book or tabletop posture): the first two sections side by
 *   side, one per pane, with nothing under the hinge.
 * App state lives outside the sections, so switching form keeps filters, cart and the current tab.
 */
export function AppTabs(props: { title: string; tabs: Tab[]; current: () => string; onTab: (v: string) => void; idiom?: Idiom }) {
  const buttons = (on: string, off: string, grow: number, role?: 'caption') => props.tabs.map(t => el('Button', {
    text: t.text,
    label: t.label,
    role,
    tone: () => (props.current() === t.value ? on : off),
    grow,
    onTap: () => props.onTab(t.value),
  }))
  const body = () => el('Stack', { grow: 1 }, match(props.current, Object.fromEntries(props.tabs.map(t => [t.value, t.body]))))
  const title = (text: string | (() => string)) => el('Text', { role: 'title', text })

  const bottomBar = (on: string, off: string) => () => el('Stack', { grow: 1 },
    el('Stack', { gap: 'group', pad: 'group', grow: 1 }, title(props.title), body()),
    el('Row', { surface: 'bar', label: 'Sections' }, ...buttons(on, off, 1)),
  )
  const pane = (i: number, axis: 'width' | 'height', heading: string | (() => string), content: () => number) =>
    el('Stack', { [axis]: () => (axis === 'width' ? panes.value[i].w : panes.value[i].h), gap: 'group', pad: 'group' }, title(heading), el('Stack', { grow: 1 }, content()))
  const spanned = (dir: 'Row' | 'Stack', axis: 'width' | 'height') => () => {
    const [a, b] = props.tabs
    return el(dir, { grow: 1, label: 'Panes' },
      pane(0, axis, props.title, a.body),
      el('Stack', { [axis]: () => viewport.value.hinge?.[axis === 'width' ? 'w' : 'h'] ?? 0, label: 'Hinge' }),
      pane(1, axis, b.text, b.body),
    )
  }

  const form = () => {
    const r = resolve('AppTabs', props.idiom).render
    if (r !== 'spanned') return r
    const h = viewport.value.hinge!
    return h.h >= viewport.value.h ? 'spanned-row' : 'spanned-col'
  }
  const forms: Record<string, () => number> = {
    'header': () => el('Stack', { gap: 'group', pad: 'group', grow: 1 },
      el('Row', { gap: 'related', align: 'center' }, el('Text', { role: 'title', text: props.title, grow: 1 }), ...buttons('accent', 'plain', 0)),
      body(),
    ),
    'tab-bar': bottomBar('tab-on', 'tab'),
    'navigation-bar': bottomBar('nav-on', 'nav'),
    'navigation-rail': () => el('Row', { grow: 1 },
      // Rail items carry short labels in the caption role, like Material's rail; 112 fits "Products" with button padding.
      el('Stack', { surface: 'rail', width: 112, pad: 'tight', gap: 'related', label: 'Sections' }, ...buttons('rail-on', 'rail', 0, 'caption')),
      el('Stack', { gap: 'group', pad: 'group', grow: 1 }, title(props.title), body()),
    ),
    'sidebar': () => el('Row', { grow: 1 },
      el('Stack', { surface: 'sidebar', width: 280, pad: 'group', gap: 'tight', label: 'Sections' }, title(props.title), ...buttons('side-on', 'side', 0)),
      el('Stack', { gap: 'group', pad: 'group', grow: 1 }, body()),
    ),
    'spanned-row': spanned('Row', 'width'),
    'spanned-col': spanned('Stack', 'height'),
  }
  return el('Stack', { grow: 1 }, match(form, forms))
}

export { platform }
