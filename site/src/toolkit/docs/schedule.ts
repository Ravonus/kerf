import type { DocGroup } from '../types.ts'

export const schedule: DocGroup = {
  file: 'schedule',
  title: 'Schedule',
  intro: 'Calendars, agendas and booking.',
  pack: true,
  docs: [
    {
      component: 'Agenda',
      summary: 'A day at a time for a phone: a week strip, swipeable days and a button to add.',
      use: {
        when: ['A calendar on a phone or in a narrow column'],
        instead: [{ name: 'Calendar', why: 'there is room for a whole week' }],
      },
      tile: 'AgendaDayToday',
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'AgendaTeamWeek',
              title: "The team's week",
              note: 'Pick a day or swipe. The + adds an event, and a long press on an event moves it.',
              stage: 'narrow',
              height: 620,
            },
          ],
        },
      ],
      keyboard: [
        ['Left and Right', 'Move between days in the strip'],
        ['Shift+F10', 'Moves the focused event'],
      ],
      a11yNotes: ['The week strip is a set of tabs. A long press always has a keyboard path.'],
      propDocs: {
        events: 'The events.',
        defaultDate: 'The day it opens on.',
        onMove: 'An event was moved. Without `onLongPress`, the built-in MoveSheet does this.',
        onCreate: 'Adds the + button, which opens the editor.',
        onOpen: 'An event was pressed.',
        firstDayOfWeek: '0 is Sunday, 1 is Monday.',
      },
      related: ['AgendaDay', 'MoveSheet', 'EventEditor'],
    },
    {
      component: 'AgendaDay',
      summary: "One day's events as a list, with free gaps and a line for now.",
      use: { when: ["Today's events in a sidebar or a dashboard card"] },
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'AgendaDayToday',
              title: 'Today',
              note: 'It goes inside an element with `data-scope="agenda"`, which holds its styles.',
              stage: 'narrow',
              height: 380,
            },
          ],
        },
        {
          kind: 'states',
          title: 'States',
          examples: [
            {
              id: 'AgendaDayEmpty',
              title: 'Nothing scheduled',
              note: 'An `AgendaDay` with no events on its `day` says nothing is scheduled.',
              stage: 'narrow',
            },
          ],
        },
      ],
      propDocs: {
        hourCycle: "`h12` for AM and PM, `h23` for a 24-hour clock. The locale's otherwise.",
        events: "Events for any days. Only `day`'s are shown.",
        day: 'The date to show.',
        now: 'The wall time for the now line.',
        label: "The list's accessible name.",
      },
      related: ['Agenda'],
    },
    {
      component: 'EventEditor',
      summary: 'A side sheet with every field of an event: title, time, repeats, zone, place.',
      use: { when: ['Creating or changing an event', 'The way to do anything a drag can do'] },
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'EventEditorChange',
              title: 'Editing an event',
              note: 'Save hands you the changed event.',
              stage: 'narrow',
              height: 240,
            },
            {
              id: 'EventEditorNew',
              title: 'A new event',
              note: 'A title is required, and the end must come after the start.',
              stage: 'narrow',
              height: 200,
            },
          ],
        },
      ],
      a11yNotes: ['Focus goes to the title on open and to the first problem on a failed save.'],
      propDocs: {
        open: 'A state you own.',
        event: 'The event to edit. Passing a new object rebuilds the fields.',
        isNew: 'Titles it New event.',
        calendars: 'The calendars on offer.',
        onSave: 'Gets the finished event.',
        onCancel: 'Cancel was pressed.',
      },
      related: ['EventPopover', 'MoveSheet', 'Drawer'],
    },
    {
      component: 'EventPopover',
      summary: "A small card with an event's details, hung from wherever it was opened.",
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'EventPopoverDetails',
              title: 'Event details',
              note: 'Join appears when the event has `video`. Edit and Delete appear with their handlers.',
              height: 380,
            },
          ],
        },
      ],
      keyboard: [['Escape', 'Closes and returns to the event']],
      a11yNotes: ['It is a non-modal dialog, so the rest of the page stays usable.'],
      propDocs: {
        event: 'The event to show.',
        open: 'A state you own.',
        anchor: 'Returns the element it hangs from. Focus goes back there.',
        zoneLabel: 'Such as "Stockholm (CET)".',
        onEdit: 'Adds Edit.',
        onDelete: 'Adds Delete.',
        onJoin: 'Join was pressed.',
      },
      related: ['EventEditor', 'Popover'],
    },
    {
      component: 'MoveSheet',
      summary: 'A sheet to move an event by picking a day, a time and a length, without dragging.',
      use: { when: ['Moving an event on a touch screen', 'Any time a drag is not an option'] },
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'MoveSheetReschedule',
              title: 'Moving an event',
              note: 'Times that clash with `events` are turned off.',
              stage: 'narrow',
              height: 220,
            },
          ],
        },
      ],
      propDocs: {
        open: 'A state you own.',
        event: 'The event to move.',
        events: 'The rest of the calendar.',
        step: 'Minutes per press of Shorter or Longer.',
        onMove: 'Gets the event and where it should go.',
        onClose: 'It closed.',
      },
      related: ['Agenda', 'EventEditor'],
    },
    {
      component: 'YearView',
      summary: 'Twelve small months with a dot for how busy each day was.',
      use: { when: ['Seeing a year at a glance', 'Jumping to a day or month'] },
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'YearViewDeploys',
              title: 'A year of deploys',
              note: 'Pick a day: the line below says what happened.',
              stage: 'fill',
              height: 1200,
            },
          ],
        },
      ],
      keyboard: [
        ['Arrow keys', 'Move between days, across months'],
        ['Enter', 'Opens the day'],
        ['M', 'Opens the month'],
        ['T', 'Goes to today'],
      ],
      a11yNotes: ['All twelve months share one tab stop.'],
      propDocs: {
        counts: "Each day's number, keyed by date.",
        events: "Events for the picked day's detail.",
        year: 'The year on show.',
        direct: 'Opens a day right away. Off, a pick shows the detail first.',
        label: 'Names the section when the year is not enough.',
        openDay: 'Open a day yourself. Return true when you did.',
        openMonth: 'Open a month yourself. Return true when you did.',
      },
      related: ['Agenda'],
    },
    {
      component: 'BookingCalendar',
      summary: 'Pick a day and a free time, confirm, and get a confirmation.',
      use: {
        when: ['Someone books time with you or your team'],
        instead: [{ name: 'MeetingPlanner', why: 'you are finding a time for several people' }],
      },
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'BookingCalendarOnboarding',
              title: 'Book an onboarding call',
              note: 'Weekends are closed, and taken times stay visible but cannot be picked.',
              stage: 'fill',
              height: 460,
            },
          ],
        },
        {
          kind: 'states',
          title: 'States',
          examples: [
            {
              id: 'BookingCalendarLoading',
              title: 'Loading',
              note: 'Set `loading` to show that times are on their way.',
              stage: 'fill',
              height: 420,
            },
            {
              id: 'BookingCalendarFailed',
              title: 'Times failed to load',
              note: 'Use `error` to say the times could not be loaded.',
              stage: 'fill',
              height: 420,
            },
          ],
        },
      ],
      a11yNotes: ['Each time is a pressed-or-not button. A typed time is always offered as well.'],
      propDocs: {
        slots: 'The times: a list, or a function of the date.',
        duration: 'Minutes.',
        isDateUnavailable: 'Days to close.',
        loading: 'The times are on their way.',
        error: 'Why the times failed.',
        onBook: 'Confirmed. Rejecting keeps the confirm step and says why.',
      },
      related: ['MeetingPlanner', 'InlineCalendar'],
    },
    {
      component: 'MeetingPlanner',
      summary: 'Find a time that works for everyone, then send the invite.',
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'MeetingPlannerReview',
              title: 'A capacity review',
              note: 'Add someone, change the length, and the suggested times update.',
              stage: 'fill',
              height: 780,
            },
          ],
        },
      ],
      a11yNotes: [
        'The suggested times are a radio group, and the availability is a table, so it reads without the colours.',
      ],
      propDocs: {
        date: 'The day to plan.',
        attendees: 'Who is invited, with their `busy` ranges in minutes.',
        loadAttendees: 'Search for people to add.',
        loadSlots: 'Your own suggestions, in place of working them out from `busy`.',
        durations: 'The lengths on offer.',
        tags: 'Labels to pick from.',
        onSubmit: 'Send was pressed.',
        onUndo: 'Adds Undo after sending.',
      },
      related: ['BookingCalendar', 'AvailabilityEditor'],
    },
    {
      component: 'AvailabilityEditor',
      summary: 'Set the hours you work each weekday, and the dates that are different.',
      sections: [
        {
          kind: 'composition',
          title: 'In context',
          examples: [
            {
              id: 'AvailabilityEditorOnCall',
              title: 'On-call hours',
              note: 'Nothing is saved until Save, and a bad range blocks it.',
              stage: 'fill',
              height: 760,
            },
          ],
        },
      ],
      a11yNotes: ['A failed Save puts focus on the first invalid time.'],
      propDocs: {
        defaultValue: 'The week and the date overrides.',
        zoneLabel: 'Such as "Stockholm (CET)".',
        from: 'The first time on offer, in minutes.',
        to: 'The last time on offer, in minutes.',
        step: 'Minutes between times.',
        onSave: 'Rejecting says so and keeps the changes.',
      },
      related: ['MeetingPlanner', 'BookingCalendar'],
    },
  ],
}
