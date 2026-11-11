// The rich inputs, with "today" and the locale pinned so a server render and a hydration agree on every cell.
import { state } from '@kerf-js/core'
import { InlineCalendar } from '../../src/Calendar'
import { DateField, DateRangeField } from '../../src/DateField'
import { DurationField } from '../../src/DurationField'
import { MonthPicker, PeriodPicker, WeekPicker } from '../../src/MonthPicker'
import { CardNumberText, PaymentCardInput } from '../../src/PaymentCard'
import { AddressField, PlaceLookupInput } from '../../src/PlaceField'
import { RecurrenceField } from '../../src/RecurrenceField'
import {
  CountrySelect,
  CurrencySelect,
  LanguageSelect,
  PhoneField,
  TimeZoneSelect,
} from '../../src/RichSelect'
import { SignaturePad } from '../../src/SignaturePad'
import { DateTimeField, TimeField } from '../../src/TimeField'

const today = '2026-10-28'
const fixed = { today, locale: 'en-US' }

export function DateFieldCase() {
  const v = state<any>('2026-10-14')
  return (
    <>
      <DateField {...fixed} label="Due date" hint="From today on." value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function DateFieldOpenCase() {
  return <DateField {...fixed} label="Due date" defaultValue="2026-10-14" />
}
export function RangeFieldCase() {
  const v = state<any>({ start: '2026-10-12', end: '2026-10-16' })
  return <DateRangeField {...fixed} label="Reporting period" value={v} maxDays={92} />
}
export function TimeFieldCase() {
  const v = state<any>('09:30')
  return (
    <>
      <TimeField {...fixed} label="Start time" value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function DateTimeFieldCase() {
  const v = state<any>('2026-11-04T10:00')
  return (
    <>
      <DateTimeField {...fixed} label="Kickoff" value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function CalendarCase() {
  const v = state<any>('2026-10-14')
  return (
    <>
      <InlineCalendar {...fixed} aria-label="Availability" value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function MonthCase() {
  const v = state<any>('2026-10')
  return (
    <>
      <MonthPicker {...fixed} label="Billing month" value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function WeekCase() {
  const v = state<any>('2026-W44')
  return (
    <>
      <WeekPicker {...fixed} label="Sprint" value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function PeriodCase() {
  const v = state<any>('2026-Q4')
  return (
    <>
      <PeriodPicker {...fixed} label="Fiscal period" value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function ZoneCase() {
  const v = state<any>('Europe/Berlin')
  return (
    <>
      <TimeZoneSelect {...fixed} label="Time zone" value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function CountryCase() {
  return <CountrySelect {...fixed} label="Country" defaultValue="DE" />
}
export function LanguageCase() {
  return <LanguageSelect {...fixed} label="Language" defaultValue="de" />
}
export function CurrencyCase() {
  return <CurrencySelect {...fixed} label="Currency" defaultValue="EUR" />
}
export function PhoneCase() {
  const v = state<any>(null)
  return (
    <>
      <PhoneField {...fixed} label="Mobile number" hint="We'll text a code." value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function DurationCase() {
  const v = state<any>('PT1H30M')
  return (
    <>
      <DurationField {...fixed} label="Estimate" value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function RecurrenceCase() {
  const v = state<any>('FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH')
  return (
    <>
      <RecurrenceField label="Repeats" dtstart="2026-10-28" locale="en-US" value={v} />
      <output data-out="">{String(v.value)}</output>
    </>
  )
}
export function CustomRuleCase() {
  return (
    <RecurrenceField
      label="Repeats"
      dtstart="2026-10-28"
      locale="en-US"
      defaultValue="FREQ=WEEKLY;BYSETPOS=2"
    />
  )
}
const PLACES = [
  {
    displayName: 'Lisbon, Portugal',
    category: 'city',
    lat: 38.7223,
    lng: -9.1393,
    timezone: 'Europe/Lisbon',
  },
  {
    displayName: 'Lima, Peru',
    category: 'city',
    lat: -12.0464,
    lng: -77.0428,
    timezone: 'America/Lima',
  },
]
const search = async (q: string) =>
  PLACES.filter((p) => p.displayName.toLowerCase().includes(q.toLowerCase()))
export function PlaceCase() {
  const v = state<any>(null)
  return (
    <>
      <PlaceLookupInput
        label="Place of birth"
        search={search}
        biases={[{ id: 'city', label: 'Cities', default: true }]}
        value={v}
      />
      <output data-out="">{v.value?.displayName ?? 'null'}</output>
    </>
  )
}
export function AddressCase() {
  const v = state<any>(null)
  return (
    <>
      <AddressField locale="en-US" value={v} />
      <output data-out="">{JSON.stringify(v.value)}</output>
    </>
  )
}
export function AddressFailCase() {
  const provider = {
    suggest: async () => {
      throw new Error('down')
    },
    resolve: async () => {
      throw new Error('down')
    },
  }
  return <AddressField locale="en-US" provider={provider} />
}
export function CardCase() {
  const mount = (el: HTMLElement) => {
    const on: any = {}
    ;(el as any).fire = (k: string, ev: any) => on[k](ev)
    return { on: (k: string, f: any) => (on[k] = f), destroy() {} }
  }
  return (
    <>
      <PaymentCardInput label="Card details" mount={mount} />
      <CardNumberText last4="4242" bin="424242" expiry={{ month: 9, year: 2028 }} />
    </>
  )
}
export function SignatureCase() {
  const v = state<any>(null)
  return (
    <>
      <SignaturePad label="Signature" value={v} />
      <output data-out="">{v.value?.text ?? String(v.value)}</output>
    </>
  )
}
