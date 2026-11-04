// Fixed locale and zone: the server's and the browser's have to print the same text.
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const compactUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const day = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
const moment = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
})
const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

export const money = (cents: number) => usd.format(cents / 100)
export const compactMoney = (cents: number) => compactUsd.format(cents / 100)
export const formatDay = (d: Date) => day.format(d)
export const formatMoment = (d: Date) => moment.format(d)
export const formatMonth = (yearMonth: string) =>
  shortMonth.format(new Date(`${yearMonth}-01T00:00:00Z`))
