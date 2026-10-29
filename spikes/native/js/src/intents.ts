// Intent components: the app says what it means ("pick one of these", "these are the app's sections") and the
// idiom table decides the platform form. App code never names a platform. Lowered form, like app.ts.
import { platform, resolve, type Idiom } from './platform'
import { el, type Child } from './runtime'

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

export type Tab = { value: string; text: () => string; label: string }

/**
 * The app's top-level sections around a body. Placement is structure, so it is decided here at build time:
 * tabs in the header on web (and under brand), a bottom tab bar on iOS, a bottom navigation bar on Android.
 */
export function AppTabs(props: { title: string; tabs: Tab[]; current: () => string; onTab: (v: string) => void; body: Child; idiom?: Idiom }) {
  const { render } = resolve('AppTabs', props.idiom)
  const tabButtons = (on: string, off: string, grow: number) => props.tabs.map(t => el('Button', {
    text: t.text,
    label: t.label,
    tone: () => (props.current() === t.value ? on : off),
    grow,
    onTap: () => props.onTab(t.value),
  }))

  if (render === 'header') {
    return el('Stack', { gap: 'group', pad: 'group' },
      el('Row', { gap: 'related', align: 'center' },
        el('Text', { role: 'title', text: props.title, grow: 1 }),
        ...tabButtons('accent', 'plain', 0),
      ),
      el('Stack', { grow: 1 }, props.body),
    )
  }
  const [on, off] = render === 'tab-bar' ? ['tab-on', 'tab'] : ['nav-on', 'nav']
  return el('Stack', {},
    el('Stack', { gap: 'group', pad: 'group', grow: 1 },
      el('Text', { role: 'title', text: props.title }),
      el('Stack', { grow: 1 }, props.body),
    ),
    el('Row', { surface: 'bar', label: 'Sections' }, ...tabButtons(on, off, 1)),
  )
}

export { platform }
