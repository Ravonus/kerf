import type { DocGroup, ExampleRef } from '../types.ts'

const field = (id: string, title: string, note?: string, height?: number): ExampleRef => ({
  id,
  title,
  stage: 'narrow',
  note,
  height,
})

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
    {
      component: 'DateTimeField',
      summary: 'One field for a date and a time, with the calendar beside a list of times.',
      use: {
        when: ['A single moment, like a deploy or a reminder'],
        instead: [{ name: 'DateField', why: 'the time does not matter' }],
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            field(
              'DateTimeFieldWindow',
              'Controlled',
              'The value is a wall time with no zone, like `2026-11-07T22:00`.',
              180,
            ),
            field(
              'DateTimeFieldStep',
              'Quarter hours',
              '`step` sets the gap between listed times, in minutes.',
              180,
            ),
            field(
              'DateTimeFieldLimits',
              'Limits',
              '`min`, `max` and `isDateUnavailable` turn days off in the calendar, here weekends and the holiday freeze.',
              180,
            ),
          ],
        },
        {
          kind: 'states',
          title: 'States',
          examples: [
            {
              id: 'DateTimeFieldStates',
              title: 'Hint, error, read-only, disabled',
              note: 'The same `hint`, `error`, `readonly` and `disabled` as every field.',
              stage: 'fill',
              height: 300,
            },
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            field(
              'DateTimeFieldWindowPair',
              'A maintenance window',
              'Two fields, and the end is checked against the start as either one changes.',
              320,
            ),
          ],
        },
      ],
      keyboard: [
        ['Up / Down', 'Changes the focused part'],
        ['Tab', 'Moves from the calendar to the times'],
        ['Escape', 'Closes the panel'],
      ],
      related: ['DateField', 'TimeField'],
    },
    {
      component: 'TimeField',
      summary: 'Type a time or pick one from a list, in the 12 or 24 hour clock.',
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            field(
              'TimeFieldClock',
              'Clocks',
              '`hourCycle` follows the locale unless you set it.',
              300,
            ),
            field(
              'TimeFieldSlots',
              'Only some times',
              '`slots` replaces the list with the times you allow.',
              180,
            ),
            field('TimeFieldHours', 'Office hours', '`min`, `max` and `step` shape the list.', 180),
            field(
              'TimeFieldClocksChange',
              'When the clocks change',
              'With `date` and `timeZone`, a time that happens twice or not at all gets a hint.',
              180,
            ),
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            field(
              'TimeFieldQuietHours',
              'Quiet hours',
              'Use `step` to set how many minutes apart the times are, here 30.',
              180,
            ),
          ],
        },
      ],
      keyboard: [
        ['Up / Down', 'Changes the hour or minute'],
        ['Arrows in the list', 'Move through the times'],
        ['Enter', 'Picks the time'],
        ['Escape', 'Closes the list'],
      ],
      propDocs: {
        step: 'Minutes between listed times.',
        slots: 'The exact times to list.',
        date: 'Only for the daylight saving hint.',
        timeZone: 'Only for the daylight saving hint.',
      },
      related: ['DateTimeField', 'DurationField'],
    },
    {
      component: 'DurationField',
      summary: 'Enter a length of time in days, hours, minutes or seconds.',
      use: {
        when: ['A length of time, not a moment'],
        instead: [
          { name: 'TimeField', why: 'it is a time of day' },
          { name: 'NumberField', why: 'there is only one unit' },
        ],
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            field(
              'DurationFieldTimeout',
              'Hours and minutes',
              'The value is an ISO duration, so 90 minutes is `PT1H30M`.',
              150,
            ),
            field('DurationFieldUnits', 'Other units', '`units` picks the boxes.', 200),
            field(
              'DurationFieldLimits',
              'Limits and steps',
              'Arrow keys move by `step` and stop at `max`.',
              150,
            ),
          ],
        },
      ],
      keyboard: [
        ['Up / Down', 'Steps the unit and carries into the next one'],
        ['Shift + Up / Down', 'Takes three steps'],
        ['Digits', 'Fill the unit'],
      ],
      propDocs: {
        units: 'Any of `d`, `h`, `m`, `s`.',
        step: 'Arrow key steps by unit.',
        balance: 'Rolls 90 minutes into 1 hour 30. Set to false to keep what was typed.',
      },
      related: ['TimeField', 'NumberField'],
    },
    {
      component: 'InlineCalendar',
      summary: 'A calendar that is always on the page, for one day, several days or a range.',
      use: {
        when: ['Booking and availability, where the month is the point'],
        instead: [
          { name: 'DateField', why: 'space is tight or typing is faster' },
          { name: 'Calendar', why: 'it shows events' },
        ],
      },
      sections: [
        {
          kind: 'variants',
          title: 'Selection',
          examples: [
            { id: 'InlineCalendarSingle', title: 'One day', stage: 'narrow', height: 420 },
            {
              id: 'InlineCalendarRange',
              title: 'A range over two months',
              stage: 'fill',
              height: 420,
              note: 'Press a start, then an end.',
            },
            {
              id: 'InlineCalendarMultiple',
              title: 'Several days',
              stage: 'narrow',
              height: 420,
              note: 'Each press turns a day on or off.',
            },
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'InlineCalendarBooking',
              title: 'Booking around taken days',
              note: 'Use `isDateUnavailable` to block days that are taken, and `min` and `max` to limit the range.',
              stage: 'narrow',
              height: 400,
            },
          ],
        },
      ],
      keyboard: [
        ['Arrows', 'Move by day or week'],
        ['Page Up / Page Down', 'Change the month'],
        ['Home / End', 'Go to the start or end of the week'],
        ['Enter or Space', 'Picks the day'],
      ],
      a11yNotes: [
        'It has no visible label, so `aria-label` is required.',
        'Every day button says the full date and its state.',
      ],
      propDocs: {
        'aria-label': 'Names the calendar for screen readers, since it has no visible label.',
        firstDayOfWeek: "The day each row starts on, 0 for Sunday to 6. The locale's otherwise.",
        weekNumbers: 'Shows the week number at the start of each row.',
        today: "Pins today's date, for server rendering and tests. The browser's clock otherwise.",
        isDateUnavailable: "Return true for a day that can't be picked: it shows struck through.",
        selection: '`single`, `multiple` or `range`. The value changes shape to match.',
        months: 'One to three months side by side.',
      },
      related: ['DateField', 'DateRangeField', 'Calendar'],
    },
    {
      component: 'MonthPicker',
      summary: 'Pick a month from a year grid.',
      use: {
        when: ['Statements, invoices and reports that run by the calendar month'],
        instead: [
          { name: 'PeriodPicker', why: 'people may want a quarter or a year too' },
          { name: 'DateRangeField', why: 'the range can start on any day' },
        ],
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            field(
              'MonthPickerInvoice',
              'Invoice month',
              'The value looks like `2026-10`. `max` stops future months.',
              180,
            ),
            field(
              'MonthPickerRange',
              'Limits',
              '`min` and `max` turn off the months outside them, and the year arrows stop at their years.',
              180,
            ),
            field(
              'MonthPickerLocale',
              'Another language',
              '`locale` names the months. The value stays `2026-03` whatever the language.',
              180,
            ),
          ],
        },
        {
          kind: 'sizes',
          title: 'Sizes',
          examples: [
            field(
              'MonthPickerSizes',
              'Small, medium and large',
              '`size` matches the other fields in a form.',
              280,
            ),
          ],
        },
        {
          kind: 'states',
          title: 'States',
          examples: [
            {
              id: 'MonthPickerStates',
              title: 'Hint, error, read-only, disabled',
              note: 'The same `hint`, `error`, `readonly` and `disabled` as every field.',
              stage: 'fill',
              height: 300,
            },
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            field(
              'MonthPickerInvoices',
              'Filter invoices',
              'The month filters the list and its total. Show all sets the value back to `null`.',
              380,
            ),
          ],
        },
      ],
      keyboard: [
        ['Arrows', 'Move between months'],
        ['Page Up / Page Down', 'Change the year'],
        ['Enter or Space', 'Picks the month'],
      ],
      related: ['WeekPicker', 'PeriodPicker'],
    },
    {
      component: 'WeekPicker',
      summary: 'Pick a whole week from a calendar.',
      use: {
        when: ['Timesheets, sprints and rotas that run by the week'],
        instead: [{ name: 'DateRangeField', why: 'the span can be any length' }],
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            field('WeekPickerSprint', 'ISO weeks', 'The value looks like `2026-W45`.', 180),
            field(
              'WeekPickerLocale',
              'Local week numbers',
              '`numbering="locale"` follows the local first day of the week.',
              180,
            ),
          ],
        },
        {
          kind: 'states',
          title: 'States',
          examples: [
            {
              id: 'WeekPickerStates',
              title: 'Hint, error, read-only, disabled',
              note: 'The same `hint`, `error`, `readonly` and `disabled` as every field.',
              stage: 'fill',
              height: 300,
            },
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            field(
              'WeekPickerTimesheet',
              'A timesheet',
              'The week gives the dates of its days. An ISO week starts on the Monday.',
              360,
            ),
          ],
        },
      ],
      keyboard: [
        ['Arrows', 'Move through the days'],
        ['Enter or Space', "Picks that day's week"],
      ],
      related: ['MonthPicker', 'PeriodPicker'],
    },
    {
      component: 'PeriodPicker',
      summary: 'Pick a year, quarter, month or week from one control.',
      use: {
        when: ['Reports that run by whole periods'],
        instead: [{ name: 'DateRangeField', why: 'the range can start on any day' }],
      },
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            field(
              'PeriodPickerReport',
              'Follows its value',
              "With no `granularity`, the value's shape decides the grid.",
              180,
            ),
            field(
              'PeriodPickerGranularity',
              'Each granularity',
              'Use `granularity` to pick `year`, `quarter`, `month` or `week`.',
              380,
            ),
          ],
        },
        {
          kind: 'states',
          title: 'States',
          examples: [
            {
              id: 'PeriodPickerStates',
              title: 'Hint, error, read-only, disabled',
              note: 'The same `hint`, `error`, `readonly` and `disabled` as every field.',
              stage: 'fill',
              height: 300,
            },
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            field(
              'PeriodPickerRevenue',
              'A report header',
              'One control picks a year, a quarter or a month, and the figure below reads the value.',
              300,
            ),
          ],
        },
      ],
      keyboard: [
        ['Arrows', 'Move between cells'],
        ['Page Up / Page Down', 'Change the page'],
        ['Enter or Space', 'Picks the period'],
      ],
      propDocs: { granularity: '`year`, `quarter`, `month` or `week`.' },
      related: ['MonthPicker', 'WeekPicker', 'DateRangeField'],
    },
    {
      component: 'RecurrenceField',
      summary:
        'Build a repeating schedule, with the rule in plain words and the next dates listed.',
      sections: [
        {
          kind: 'variants',
          title: 'Variants',
          examples: [
            field(
              'RecurrenceFieldBackup',
              'Weekly on set days',
              'The value is a standard RRULE string.',
              420,
            ),
            field(
              'RecurrenceFieldLimited',
              'Fewer choices',
              '`frequencies` and `preview` trim the field.',
              360,
            ),
            field(
              'RecurrenceFieldCustom',
              "A rule it can't edit",
              "Parts it doesn't understand are never rewritten, so it shows the rule read-only.",
              240,
            ),
          ],
        },
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            field(
              'RecurrenceFieldInCard',
              'In a settings card',
              'Use `dtstart` for the first date and `preview` for how many coming dates to list.',
              460,
            ),
          ],
        },
      ],
      propDocs: {
        dtstart: 'The first date, which the next dates count from.',
        preview: 'How many next dates to list.',
        frequencies: 'Which of `DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY` to offer.',
      },
      related: ['Calendar', 'DateField'],
    },
  ],
}
