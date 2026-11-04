import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'

import { LemonAvatar, type LemonExpression } from '~/components/lemon'
import { CoachBubble, cx } from '~/components/ui'
import { RotateCcw } from '~/components/ui/icons'

type Line =
  | { from: 'coach'; text: string; expression: LemonExpression }
  | { from: 'kid'; text: string }

/** Illustrative conversation (not a real learner). Lemon asks; the kid decides. */
const SCRIPT: Line[] = [
  {
    from: 'coach',
    expression: 'curious',
    text: 'Hi Maya! Your idea is dog-walking. Who do you think would pay for it?',
  },
  { from: 'kid', text: 'Everyone with a dog?' },
  {
    from: 'coach',
    expression: 'thinking',
    text: "Good start. Let's get specific: which neighbors are busy at 4pm on a weekday?",
  },
  { from: 'kid', text: 'The Parks! They both work late.' },
  {
    from: 'coach',
    expression: 'excited',
    text: "That's your first customer interview. What three questions will you ask them?",
  },
]

const BEAT_MS = 1700
const TYPING_MS = 900

/**
 * A mini chat that plays once when scrolled into view. Built in markup, no
 * screenshots. Under reduced motion it shows the whole exchange at once.
 */
export function CoachDemo() {
  const [shown, setShown] = createSignal(1)
  const [typing, setTyping] = createSignal(false)
  const [run, setRun] = createSignal(1)
  let root!: HTMLDivElement
  let stop = () => {}

  const arm = () => {
    stop()
    const timers: number[] = []
    const play = () => {
      setShown(1)
      for (let i = 1; i < SCRIPT.length; i++) {
        const t = i * BEAT_MS
        if (SCRIPT[i]!.from === 'coach') {
          timers.push(window.setTimeout(() => setTyping(true), t - TYPING_MS))
        }
        timers.push(
          window.setTimeout(() => {
            setTyping(false)
            setShown(i + 1)
          }, t),
        )
      }
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          io.disconnect()
          play()
        }
      },
      { threshold: 0.45 },
    )
    io.observe(root)
    stop = () => {
      io.disconnect()
      timers.forEach((t) => window.clearTimeout(t))
    }
  }

  onMount(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setShown(SCRIPT.length)
    else arm()
  })
  onCleanup(() => stop())

  const lines = createMemo(() => SCRIPT.slice(0, shown()))
  const mood = createMemo<LemonExpression>(() => {
    if (typing()) return 'thinking'
    const last = lines().findLast((l) => l.from === 'coach')
    return last?.from === 'coach' ? last.expression : 'happy'
  })
  const done = () => shown() >= SCRIPT.length

  return (
    <div ref={root} class="overflow-hidden rounded-panel bg-surface shadow-pop ring-2 ring-navy">
      <div class="flex items-center gap-3 bg-navy px-4 py-3 text-white sm:px-5">
        <LemonAvatar uid="coach-avatar" size={46} expression={mood()} tone="navy" decorative />
        <div class="min-w-0 flex-1">
          <p class="leading-tight font-semibold">Lemon</p>
          <p class="text-sm text-white/75" aria-live="off">
            {typing() ? 'thinking…' : 'Your coach · Step 2: Test your idea'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTyping(false)
            setRun((n) => n + 1)
            arm()
          }}
          class={cx(
            'grid size-11 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white',
            !done() && 'invisible',
          )}
          aria-label="Replay conversation"
          tabindex={done() ? 0 : -1}
        >
          <RotateCcw class="size-4.5" />
        </button>
      </div>
      <div
        role="log"
        aria-label="Example conversation between Lemon and a young founder"
        class="grain flex min-h-[25rem] flex-col justify-end gap-4 bg-lemon-soft/60 px-4 py-6 sm:px-6"
      >
        {/* A replay rebuilds the lines, so each one pops in again. */}
        <Show when={run()} keyed>
          <For each={lines()}>
            {(line) => (
              <div class="animate-pop-in">
                {line.from === 'coach' ? (
                  <CoachBubble name="Lemon">{line.text}</CoachBubble>
                ) : (
                  <CoachBubble from="kid" name="Maya, 11">
                    {line.text}
                  </CoachBubble>
                )}
              </div>
            )}
          </For>
        </Show>
        <Show when={typing()}>
          <div class="flex animate-pop-in" aria-hidden="true">
            <span class="inline-flex gap-1 rounded-[1.1rem] rounded-bl-[4px] bg-surface px-4 py-3.5 ring-2 ring-navy">
              <For each={[0, 1, 2]}>
                {(d) => (
                  <span
                    class="size-1.5 animate-bounce rounded-full bg-navy/50"
                    style={`animation-delay:${d * 120 - 240}ms`}
                  />
                )}
              </For>
            </span>
          </div>
        </Show>
      </div>
      <div
        class="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3.5 sm:px-6"
        aria-hidden={!done()}
      >
        <span class="text-sm text-muted">Maya chooses:</span>
        <For each={['Help me start', "I'll write them myself"]}>
          {(chip, i) => (
            <span
              class={cx(
                'rounded-pill px-3 py-1.5 text-sm font-semibold transition-opacity duration-500',
                i() === 1 ? 'bg-navy text-white' : 'bg-gold-soft text-ink ring-1 ring-line',
                done() ? 'opacity-100' : 'opacity-0',
              )}
            >
              {chip}
            </span>
          )}
        </For>
      </div>
    </div>
  )
}
