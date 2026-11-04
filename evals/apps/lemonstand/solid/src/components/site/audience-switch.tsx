import { createSignal, For, type JSX } from 'solid-js'

import { cx } from '~/components/ui'

export type Audience = { id: string; label: string; short: string; panel: () => JSX.Element }

/** Segmented "who are you?" control (ARIA tabs). Arrow keys / Home / End move focus. */
export function AudienceSwitch(props: { audiences: Audience[] }) {
  const [active, setActive] = createSignal(0)
  const tabs: HTMLButtonElement[] = []

  const select = (i: number) => {
    const n = (i + props.audiences.length) % props.audiences.length
    setActive(n)
    tabs[n]?.focus()
  }

  return (
    <div>
      <p id="audience-label" class="text-sm font-semibold text-muted">
        I&apos;m here for…
      </p>
      <div
        role="tablist"
        aria-labelledby="audience-label"
        class="mt-2.5 inline-flex w-full max-w-full gap-1 rounded-[0.95rem] bg-sunken p-1 ring-1 ring-line sm:w-auto"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') select(active() + 1)
          else if (e.key === 'ArrowLeft') select(active() - 1)
          else if (e.key === 'Home') select(0)
          else if (e.key === 'End') select(props.audiences.length - 1)
          else return
          e.preventDefault()
        }}
      >
        <For each={props.audiences}>
          {(a, i) => (
            <button
              ref={(el) => {
                tabs[i()] = el
              }}
              id={`audience-tab-${a.id}`}
              role="tab"
              type="button"
              aria-selected={i() === active()}
              aria-controls={`audience-panel-${a.id}`}
              tabindex={i() === active() ? 0 : -1}
              onClick={() => setActive(i())}
              class={cx(
                'min-h-11 flex-1 rounded-control px-3 text-[0.9rem] font-semibold transition-[background-color,color,box-shadow] sm:flex-none sm:px-4 sm:text-[0.95rem]',
                i() === active()
                  ? 'bg-surface text-ink shadow-card ring-1 ring-line'
                  : 'text-muted hover:text-ink',
              )}
            >
              <span class="sm:hidden">{a.short}</span>
              <span class="hidden sm:inline">{a.label}</span>
            </button>
          )}
        </For>
      </div>
      <For each={props.audiences}>
        {(a, i) => (
          <div
            id={`audience-panel-${a.id}`}
            role="tabpanel"
            aria-labelledby={`audience-tab-${a.id}`}
            hidden={i() !== active()}
            class="mt-6 animate-fade-up"
          >
            {a.panel()}
          </div>
        )}
      </For>
    </div>
  )
}
