import type { DocGroup } from '../../types.ts'
import { field } from './examples.ts'

export const timeFields: DocGroup['docs'] = [
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
]
