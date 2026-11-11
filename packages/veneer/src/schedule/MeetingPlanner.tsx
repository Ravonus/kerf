import { announce, uid, type Attendee } from '@kerf-js/veneer-core'
import { untrack } from '@kerf-js/core'
import { usePickerEnv } from '../Picker'
import { Segmented } from '../Choice'
import { AttendeesCard, DetailsCard, TimelineCard, InviteCard } from './MeetingPlanner-view'
import {
  plannerInputs,
  watchSlots,
  plannerComputed,
  peopleActions,
  radioAction,
  sendAction,
} from './MeetingPlanner-model'
import '@kerf-js/veneer-core/styles/app/booking.css'
import '@kerf-js/veneer-core/styles/app/calendar.css'

/** What the planner sends: who, when and about what. */
export type MeetingDetails = {
  attendees: Attendee[]
  title: string
  link: string
  tags: string[]
  date: string
  s: number
  e: number
}
/** Props for MeetingPlanner. */
export type MeetingPlannerProps = {
  date: string
  attendees?: Attendee[] | undefined
  /** Search for people to add. */
  loadAttendees?: ((q: string, signal: AbortSignal) => Promise<Attendee[]>) | undefined
  /** The app's own suggestions; else they come from everyone's `busy`. */
  loadSlots?:
    | ((input: {
        attendees: Attendee[]
        date: string
        duration: number
      }) => number[] | Promise<number[]>)
    | undefined
  /** The meeting's starting length, in minutes. Default 30. */
  duration?: number | undefined
  durations?: number[] | undefined
  title?: string | undefined
  /** The meeting link the form starts with, such as a video call URL. */
  link?: string | undefined
  tags?: string[] | undefined
  /** The strip's hours, minutes since midnight. */
  from?: number | undefined
  /** Where the strip's hours end, in minutes since midnight. */
  to?: number | undefined
  /** The IANA zone times are shown in, such as `Europe/Berlin`. */
  timeZone?: string | undefined
  /** Pins today's date, for server rendering and tests. The browser's clock otherwise. */
  today?: string | undefined
  locale?: string | undefined
  /** `h12` for AM and PM, `h23` for a 24-hour clock. The locale's otherwise. */
  hourCycle?: string | undefined
  onSubmit: (m: MeetingDetails) => void | Promise<unknown>
  onUndo?: (() => void) | undefined
}

/**
 * MeetingPlanner (07 §2.2, `#planner`): attendees, details, an availability table with an Everyone row, three suggested
 * times as a radiogroup, a manual time, Send. Everything is drawn from `busy`, so it works from a query or a signal.
 */
export function MeetingPlanner(p: MeetingPlannerProps) {
  const id = uid('plan')
  const env = usePickerEnv(
    () => p.locale,
    () => p.today,
  )
  const props = untrack(() => p)
  const input = plannerInputs(props, env)
  let root: HTMLDivElement | undefined
  let group: HTMLDivElement | undefined
  const say = (t: string, loud = false) => root && announce(root.ownerDocument, t, loud)
  watchSlots(props, input)
  const computed = plannerComputed(props, env, input)
  const context = {
    ...input,
    ...computed,
    p: props,
    say,
    getRoot: () => root,
    getGroup: () => group,
  }
  const onRadio = radioAction(context)
  const send = sendAction(context)
  const view = {
    ...context,
    ...peopleActions(context),
    id,
    env,
    onRadio,
    send,
    setGroup: (n: HTMLDivElement) => (group = n),
  }
  const { len, lens, setLen } = view
  return (
    <div ref={(n) => (root = n)} class="stack">
      <div class="row">
        <div>
          <span data-part="eyebrow">MeetingPlanner</span>
          <h3>Find a time</h3>
        </div>
        <span style="flex:1"></span>
        <Segmented
          label="Duration"
          size="sm"
          value={String(len.value)}
          onChange={setLen}
          options={lens.value}
        />
      </div>
      <AttendeesCard view={view} />
      <DetailsCard view={view} />
      <TimelineCard view={view} />
      <InviteCard view={view} />
    </div>
  )
}
