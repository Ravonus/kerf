import {
  clock,
  clockRange,
  fmt,
  minutes,
  sharedFree,
  suggestSlots,
  withinHours,
  zoneCity,
  zoneMinute,
  type Attendee,
  type IsoTime,
} from '@kerf/veneer-core'
import { derived, flush, state, untrack, watch, type State } from '@kerf/core'
import type { MeetingPlannerProps } from './MeetingPlanner'
import { confirmSweep } from './bits'

type Env = { locale: State<string> }

export function plannerInputs(p: MeetingPlannerProps, env: Env) {
  const people = state<Attendee[]>(untrack(() => p.attendees ?? []))
  const len = state(untrack(() => p.duration ?? 30))
  const lens = derived(() =>
    (p.durations ?? [15, 30, 45, 60]).map((m) => ({ value: String(m), label: `${m} min` })),
  )
  const title = state(untrack(() => p.title ?? ''))
  const link = state(untrack(() => p.link ?? ''))
  const query = state('')
  const manual = state(false)
  const typed = state<IsoTime | null>(null)
  const sent = state(false)
  const busy = state(false)
  const failed = state<string | null>(null)
  const remote = state<number[] | null>(null)
  const from = derived(() => p.from ?? 480)
  const to = derived(() => p.to ?? 1080)
  const width = derived(() => to.value - from.value)
  const ticks = derived(() =>
    Array.from({ length: Math.round(width.value / 60) }, (_, i) => from.value + i * 60),
  )
  const busyLists = derived(() => people.value.map((a) => a.busy ?? []))
  const slots = derived(
    () =>
      remote.value ??
      suggestSlots(people.value, p.date, {
        len: len.value,
        from: from.value,
        to: to.value,
        zone: p.timeZone,
      }),
  )
  const shared = derived(() => sharedFree(busyLists.value, from.value, to.value))
  const pick = state<number | null>(null)
  const chosen = derived(() =>
    manual.value
      ? typed.value
        ? minutes(typed.value)
        : null
      : pick.value !== null && slots.value.includes(pick.value)
        ? pick.value
        : (slots.value[0] ?? null),
  )
  const time = (m: number) => clock(m, env.locale.value, p.hourCycle)
  const span = (a: number, b: number) => clockRange(a, b, env.locale.value, p.hourCycle)
  const left = (m: number) => ((m - from.value) / width.value) * 100
  const size = (m: number) => (m / width.value) * 100
  return {
    people,
    len,
    lens,
    title,
    link,
    query,
    manual,
    typed,
    sent,
    busy,
    failed,
    remote,
    ticks,
    slots,
    shared,
    pick,
    chosen,
    time,
    span,
    left,
    size,
  }
}

type Inputs = ReturnType<typeof plannerInputs>

export function watchSlots(p: MeetingPlannerProps, { people, len, remote }: Inputs) {
  watch(
    () => [people.value, len.value] as const,
    ([a, l]) => {
      if (!p.loadSlots) return
      const r = p.loadSlots({ attendees: a, date: p.date, duration: l })
      if (Array.isArray(r)) remote.value = r
      else void r.then((v) => (remote.value = v))
    },
  )
}

export function plannerComputed(
  p: MeetingPlannerProps,
  env: Env,
  { chosen, people, len, span, time }: Inputs,
) {
  const fit = derived(() => {
    const s = chosen.value
    return s === null ? 0 : withinHours(people.value, p.date, s, len.value, p.timeZone)
  })
  const elsewhere = derived(() => {
    const s = chosen.value
    if (s === null) return []
    return [...new Set(people.value.map((a) => a.zone).filter((z) => z && z !== p.timeZone))]
      .slice(0, 2)
      .map((z) => `${zoneCity(z!)} ${time(zoneMinute(p.date, s, p.timeZone, z))}`)
  })
  const summary = derived(() =>
    chosen.value === null
      ? 'No common time today'
      : `${fmt(p.date, { weekday: 'short', month: 'short', day: 'numeric' }, env.locale.value)} · ${span(chosen.value, chosen.value + len.value)}`,
  )
  return { fit, elsewhere, summary }
}

type Computed = ReturnType<typeof plannerComputed>

type Context = Inputs &
  Computed & {
    p: MeetingPlannerProps
    say: (message: string, loud?: boolean) => unknown
    getRoot: () => HTMLDivElement | undefined
    getGroup: () => HTMLDivElement | undefined
  }

export function peopleActions({ people, query, slots, len, say }: Context) {
  const add = (a: Attendee) => {
    if (!people.value.some((x) => x.id === a.id)) people.value = [...people.value, a]
    query.value = ''
    say(`${a.name} added. ${slots.value.length} times work for everyone.`)
  }
  const drop = (a: Attendee) => {
    people.value = people.value.filter((x) => x.id !== a.id)
    say(`${a.name} removed`)
  }
  const setLen = (v: string) => {
    len.value = +v
    flush()
    say(`${v} minutes. ${slots.value.length} times work for everyone.`)
  }
  return { add, drop, setLen }
}

export function radioAction({ slots, chosen, pick, getGroup }: Context) {
  const onRadio = (e: KeyboardEvent) => {
    const d = (
      { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>
    )[e.key]
    const list = slots.value
    const i = list.indexOf(chosen.value!)
    const n = d
      ? (i + d + list.length) % list.length
      : e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? list.length - 1
          : -1
    if (n < 0) return
    e.preventDefault()
    pick.value = list[n]!
    flush()
    getGroup()?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus()
  }
  return onRadio
}

export function sendAction({
  chosen,
  busy,
  failed,
  p,
  people,
  title,
  link,
  len,
  sent,
  say,
  summary,
  getRoot,
}: Context) {
  const send = async () => {
    const s = chosen.value
    if (s === null || busy.value) return
    busy.value = true
    failed.value = null
    try {
      await p.onSubmit({
        attendees: people.value,
        title: title.value,
        link: link.value,
        tags: p.tags ?? [],
        date: p.date,
        s,
        e: s + len.value,
      })
      sent.value = true
      say(`Invite sent for ${summary.value}`)
      flush()
      confirmSweep(getRoot()?.querySelector('[data-arrive]'))
    } catch (err) {
      failed.value = (err as Error | undefined)?.message ?? 'Try again.'
      say(`Couldn't send the invite: ${failed.value}`, true)
    } finally {
      busy.value = false
    }
  }
  return send
}
