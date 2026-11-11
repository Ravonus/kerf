// Public time and date-time field options.
import type { IsoDate, IsoDateTime, IsoTime, TimeZoneId } from '@kerf-js/veneer-core'
import type { Bindable, Openable, RichFieldProps } from './Picker'

/** Props for TimeField. */
export type TimeFieldProps = RichFieldProps &
  Bindable<IsoTime | null> &
  Openable & {
    /** `h12` shows AM and PM, `h23` a 24-hour clock, `auto` the locale's. */
    hourCycle?: 'h12' | 'h23' | 'auto' | undefined
    step?: number | undefined
    /** Adds a seconds segment. */
    seconds?: boolean | undefined
    min?: IsoTime | undefined
    max?: IsoTime | undefined
    slots?: IsoTime[] | undefined
    /** Only for the DST hint. */
    date?: IsoDate | undefined
    timeZone?: TimeZoneId | undefined
  }

/** Props for DateTimeField. */
export type DateTimeFieldProps = RichFieldProps &
  Bindable<IsoDateTime | null> &
  Openable & {
    min?: IsoDate | undefined
    max?: IsoDate | undefined
    /** Return true for a day that can't be picked: it shows struck through. */
    isDateUnavailable?: ((d: IsoDate) => boolean) | undefined
    /** The day each calendar row starts on, 0 for Sunday to 6. The locale's otherwise. */
    firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined
    step?: number | undefined
  }
