import type { DocGroup } from '../../types.ts'
import { field } from './examples.ts'

export const calendars: DocGroup['docs'] = [
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
    summary: 'Build a repeating schedule, with the rule in plain words and the next dates listed.',
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
]
