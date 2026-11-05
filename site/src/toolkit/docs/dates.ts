import { field } from './dates/examples.ts'
import { timeFields } from './dates/time-fields.ts'
import { calendars } from './dates/calendars.ts'
import type { DocGroup } from '../types.ts'

export const dates: DocGroup = {
  file: 'dates',
  title: 'Dates and time',
  intro: 'Date, time and duration fields, and calendars.',
  pack: true,
  docs: [
    {
      component: 'Calendar',
      summary: 'A full calendar with month, week, day, agenda, timeline and year views.',
      use: {
        when: [
          'People read and change a schedule of events',
          'Events move, resize or get created by dragging',
        ],
        instead: [
          { name: 'InlineCalendar', why: 'people only pick a day' },
          { name: 'Agenda', why: 'a read-only list of what is next is enough' },
        ],
      },
      tile: 'CalendarMonth',
      sections: [
        {
          kind: 'variants',
          title: 'Views',
          examples: [
            {
              id: 'CalendarWeek',
              title: 'Editable week',
              stage: 'fill',
              height: 760,
              note: 'Drag to move, drag an edge to resize, drag empty time to create. Your handlers keep the events.',
            },
            {
              id: 'CalendarMonth',
              title: 'Read-only month',
              stage: 'fill',
              height: 680,
              note: '`views` limits the tabs and `readOnly` turns off every edit.',
            },
            {
              id: 'CalendarRooms',
              title: 'Rooms timeline',
              stage: 'fill',
              height: 460,
              note: '`resources` adds the rows, and events point at one with `resource`. `timeline` sets the hours it spans.',
            },
            {
              id: 'CalendarBusyDay',
              title: 'Overlapping meetings',
              stage: 'fill',
              height: 760,
              note: 'Events that overlap share the column in lanes, so none hides another. Switch to Week to see the same morning beside the rest. The now line runs only through the lanes free at its minute.',
            },
            {
              id: 'CalendarAgenda',
              title: 'Agenda of the week',
              stage: 'fill',
              height: 620,
              note: 'The same events as a list, day by day: what a phone or a quick look wants.',
            },
          ],
        },
      ],
      keyboard: [
        ['Tab', 'Moves between the toolbar, the views and the events'],
        ['M', 'On a focused event: starts moving it with the arrow keys'],
        ['Enter', 'Opens the focused event'],
      ],
      a11yNotes: [
        'Every drag has a keyboard route, and the event editor can change the same fields without dragging.',
        'Pass `today` and `now` to keep the server and browser in step. Without them they arrive after the page loads.',
      ],
      propDocs: {
        events: 'The events to show. You own this list.',
        calendars: 'The named sources in the side rail.',
        workingHours:
          'The start and end of the working day, in minutes from midnight: `[540, 1080]` is 09:00 to 18:00. The rest is shaded.',
        timeline: 'The hours the timeline spans, in minutes from midnight.',
        onMove:
          'Called with the event and its new times. Return a rejected promise to put it back.',
      },
      related: ['InlineCalendar', 'DateField', 'RecurrenceField'],
    },
    {
      component: 'DateField',
      summary: 'Type a date or pick one from a calendar in a popover.',
      use: {
        when: ['One date in a form', 'People may know the date and want to type it'],
        instead: [
          { name: 'DateTimeField', why: 'the time matters too' },
          { name: 'DateRangeField', why: 'it is a start and an end' },
          { name: 'InlineCalendar', why: 'the calendar should always show' },
        ],
      },
      playground: {
        example: 'DateFieldPlay',
        code: '<DateField{props} />',
        knobs: [
          { prop: 'label', control: 'text', initial: 'Release date', default: '' },
          { prop: 'hint', control: 'text', initial: '', default: '' },
          { prop: 'weekNumbers', control: 'switch', initial: false, default: false },
          { prop: 'disabled', control: 'switch', initial: false, default: false },
        ],
        stage: 'narrow',
        height: 200,
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            field(
              'DateFieldRelease',
              'Controlled',
              'The value is an ISO date, like `2026-11-14`, or null.',
              180,
            ),
            field(
              'DateFieldLimits',
              'Limits',
              '`min`, `max` and `isDateUnavailable` turn days off in the calendar.',
              180,
            ),
            field(
              'DateFieldWeeks',
              'Week numbers',
              "Set the week's first day and show its number.",
              180,
            ),
          ],
        },
        {
          kind: 'states',
          title: 'States',
          examples: [
            field(
              'DateFieldStates',
              'Hint, error, read-only, disabled',
              'A date field can show a `hint` or an `error`, and can be `readonly` or `disabled`.',
              380,
            ),
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            field(
              'DateFieldSchedule',
              'Schedule a deploy',
              'A date and a time in one small form.',
              240,
            ),
          ],
        },
      ],
      keyboard: [
        ['Up / Down', 'Changes the focused part of the date'],
        ['Left / Right', 'Moves between month, day and year'],
        ['Arrows in the calendar', 'Move by day or week'],
        ['Page Up / Page Down', 'Change the month'],
        ['Enter', 'Picks the day'],
        ['Escape', 'Closes the calendar'],
      ],
      a11yNotes: [
        'Each part of the date is its own spin button, and every calendar day is named in full.',
        'On phones the calendar opens as a sheet.',
      ],
      propDocs: {
        today: 'Fixes what today is, for tests and server rendering.',
        isDateUnavailable: 'Return true to turn a day off.',
        parse: 'Your own reader for pasted or typed text.',
      },
      related: ['DateRangeField', 'DateTimeField', 'InlineCalendar'],
    },
    {
      component: 'DateRangeField',
      summary:
        'Pick a start and end date, with presets like Last 30 days and an optional comparison.',
      use: {
        when: ['Filtering a report or a list by dates', 'Booking a span of days'],
        instead: [{ name: 'PeriodPicker', why: 'the range is a whole month, quarter or year' }],
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            field(
              'DateRangeFieldPresets',
              'Default presets',
              'Press the field to see the rail of presets.',
              180,
            ),
            field(
              'DateRangeFieldCustom',
              'Your own presets',
              'Each preset is a function of today.',
              180,
            ),
            field(
              'DateRangeFieldLimit',
              'A longest span',
              '`maxDays` stops the range growing past a limit.',
              200,
            ),
            field(
              'DateRangeFieldCompare',
              'Compare',
              '`compare` shades the earlier period in the calendar.',
              180,
            ),
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            field(
              'DateRangeFieldFilter',
              'Filter a list',
              'Change the range, and the list follows.',
              320,
            ),
          ],
        },
      ],
      keyboard: [
        ['Arrows in the calendar', 'Move by day or week, previewing the range'],
        ['Enter', 'Sets the start, then the end'],
        ['Escape', 'Closes the calendar'],
      ],
      propDocs: {
        presets: 'A list of your own, `"default"`, or `false` for none.',
        months: 'Months shown side by side. `auto` follows the width.',
        compare: '`previous-period`, `previous-year` or a range of your own.',
        maxDays: 'The longest range allowed.',
      },
      related: ['DateField', 'PeriodPicker', 'InlineCalendar'],
    },
    ...timeFields,
    ...calendars,
  ],
}
