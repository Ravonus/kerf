import {
  filterShortcuts,
  isApple,
  markParts,
  shortcutLabels,
  shortcuts as registry,
  type Shortcut,
  type Shortcuts,
} from '@weft-js/warp-core'
import { derived, onCleanup, onMount, state, untrack, type State } from '@weft-js/core'
import { Search } from '../Field'
import { Kbd } from '../Kbd'
import { Modal } from '../Modal'
import '../styles'
import '@weft-js/warp-core/styles/flows/shortcuts.css'

/**
 * The keyboard shortcuts overlay (09 §7): `?` opens a Dialog (a bottom sheet on phones) of what's registered now,
 * grouped, platform-aware, with a filter over names and keys. Never shown by itself. `shortcuts.singleKeys = false`
 * turns the single-key ones off (WCAG 2.1.4); they never fire in a text input.
 */
export function ShortcutsOverlay({
  open,
  shortcuts = registry,
}: {
  open?: State<boolean>
  shortcuts?: Shortcuts
}) {
  const own = state(false)
  const on = untrack(() => open) ?? own
  const reg = untrack(() => shortcuts)
  const apple = state(false)
  const rev = state(0)
  const query = state('')
  onMount(() => {
    apple.value = isApple(navigator)
    const quiet = reg.subscribe(() => rev.value++)
    const drop = reg.register({
      keys: '?',
      label: 'Show shortcuts',
      group: 'Help',
      run: () => (on.value = true),
    })
    const stop = reg.listen(document)
    onCleanup(() => {
      drop()
      stop()
      quiet()
    })
  })
  const groups = derived(() => {
    void rev.value
    const by = new Map<string, Shortcut[]>()
    for (const s of filterShortcuts(reg.list(), query.value, apple.value)) {
      const g = s.group ?? 'General'
      by.set(g, [...(by.get(g) ?? []), s])
    }
    return [...by].map(([name, rows]) => ({ name, rows }))
  })
  return (
    <Modal
      open={on}
      size="lg"
      title="Keyboard shortcuts"
      description="Press ? anywhere outside a text field."
    >
      <div data-scope="shortcuts">
        <Search
          label="Filter shortcuts"
          autofocus
          onInput={(e) => (query.value = e.currentTarget.value)}
        />
        <div data-part="groups" aria-live="polite">
          {groups.value.map((g) => (
            <section key={g.name}>
              <h4 aria-level="3">{g.name}</h4>
              <dl>
                {g.rows.map((s) => (
                  <div key={s.keys}>
                    <dt>
                      {markParts(s.label, query.value).map((p) =>
                        p.hit ? <mark key={p.at}>{p.text}</mark> : <span key={p.at}>{p.text}</span>,
                      )}
                    </dt>
                    <dd>
                      {shortcutLabels(s.keys, apple.value).map((step, i) => (
                        <span key={step.join()}>
                          {i > 0 && ' then '}
                          {step.map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          {groups.value.length === 0 && (
            <p data-part="empty">No shortcut matches “{query.value}”.</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
