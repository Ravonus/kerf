import type { Doc } from '../../types.ts'

export const feedbackNotifications: Doc[] = [
  {
    component: 'Toaster',
    summary: 'Where toasts appear: short messages that come and go on their own.',
    use: {
      when: ['Confirming something people just did', "News that doesn't need an answer"],
      instead: [
        { name: 'Alert', why: 'it has to stay on the page until it is dealt with' },
        { name: 'Modal', why: 'people must answer before going on' },
      ],
    },
    playground: {
      example: 'ToasterPlay',
      code: 'toast.show({ title, description, tone, action })\n\n<Toaster />',
      knobs: [
        { prop: 'title', control: 'text', initial: 'Deploy finished', default: '' },
        {
          prop: 'description',
          control: 'text',
          initial: 'storefront is live in eu-west.',
          default: '',
        },
        {
          prop: 'tone',
          control: 'select',
          options: ['neutral', 'accent', 'positive', 'info', 'caution', 'critical'],
          initial: 'positive',
          default: 'neutral',
        },
        {
          prop: 'action',
          control: 'switch',
          label: 'With an action',
          initial: false,
          default: false,
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'ToasterBasic',
            title: 'A confirmation',
            note: 'Mount one `Toaster` near the root, then call `toast.show` from anywhere.',
          },
          {
            id: 'ToasterPosition',
            title: 'Position',
            note: 'Use `position` on `Toaster` to pick the corner.',
            height: 200,
          },
          { id: 'ToasterTones', title: 'Tones', note: 'Each `tone` brings its own icon.' },
          {
            id: 'ToasterUndo',
            title: 'With an action',
            note: 'An `action` gives people ten seconds to take it.',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'ToasterPromise',
            title: 'Following a promise',
            note: '`toast.promise` shows one toast from pending to done, in place.',
          },
          {
            id: 'ToasterSeveral',
            title: 'Several at once',
            note: 'Three stack up, and fan out on hover. Hovering pauses every timer.',
          },
          {
            id: 'ToasterDismissed',
            title: 'Closing from code',
            note: '`duration: 0` keeps it up until `toast.dismiss` with the id `toast.show` returned.',
          },
          {
            id: 'ToasterAfterRedirect',
            title: 'On arrival',
            note: 'Fire one as a page mounts, to finish what the last page started.',
            replay: true,
          },
        ],
      },
    ],
    keyboard: [
      ['F8', 'Moves focus to the newest toast'],
      ['Esc', 'Leaves the toasts'],
    ],
    a11yNotes: [
      'Toasts are read out through a live region that is on the page from the start.',
      'Hovering or focusing the stack pauses every timer.',
      'A critical toast with an action stays until it is dismissed.',
    ],
    propDocs: {
      position: 'The corner or edge toasts stack in, such as `top-center`. Bottom right otherwise.',
    },
    related: ['Alert', 'Progress', 'Button'],
  },
  {
    component: 'Alert',
    summary: 'A message that stays in the page until it is dealt with.',
    use: {
      when: [
        'Something people should know about this part of the page',
        'A form error that has just happened',
      ],
      instead: [
        { name: 'Toaster', why: 'it is a passing confirmation' },
        { name: 'Modal', why: "people can't go on until they answer" },
      ],
    },
    playground: {
      example: 'AlertPlay',
      code: '<Alert{props}>{children}</Alert>',
      stage: 'fill',
      knobs: [
        { prop: 'title', control: 'text', initial: 'Deploy failed', default: '' },
        {
          prop: 'children',
          control: 'text',
          label: 'Text',
          initial: 'mobile-bff stopped at the health check.',
          default: '',
        },
        {
          prop: 'tone',
          control: 'select',
          options: ['info', 'neutral', 'accent', 'positive', 'caution', 'critical'],
          initial: 'critical',
          default: 'info',
        },
        { prop: 'live', control: 'switch', initial: false, default: false },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          {
            id: 'AlertTones',
            title: 'Tones',
            note: 'Icon and words carry the meaning, so it never depends on colour.',
            stage: 'fill',
            height: 360,
          },
          {
            id: 'AlertTitleOnly',
            title: 'Title only',
            note: 'An alert needs only a `title` when nothing more has to be said.',
            stage: 'fill',
          },
          {
            id: 'AlertBodyOnly',
            title: 'Text only',
            note: 'An alert can carry just text, with no `title`.',
            stage: 'fill',
          },
          {
            id: 'AlertWithActions',
            title: 'With actions',
            note: 'Use `actions` to add buttons under the message.',
            stage: 'fill',
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'AlertDismiss',
            title: 'Dismissible',
            note: '`onDismiss` adds the close button. You remove the alert.',
            stage: 'fill',
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'AlertFormError',
            title: 'A form error',
            note: 'Press Add domain with the box empty. `live` announces it.',
            stage: 'narrow',
            height: 300,
          },
          {
            id: 'AlertUsage',
            title: 'Close to a limit',
            note: 'An alert with `tone` set to `caution` and an `actions` button warns about a limit and offers a fix.',
            stage: 'fill',
          },
        ],
      },
    ],
    a11yNotes: [
      '`live` sets `role="alert"`, which interrupts screen readers. Keep it for new errors.',
      'An alert on the page at load is not announced.',
    ],
    propDocs: {
      tone: 'What it means. Sets the colour and the icon.',
      title: 'The first line, in bold.',
      live: 'Read it out as soon as it appears. Only for new errors.',
      actions: 'Buttons, under the text.',
      onDismiss: 'Adds a close button. Called when it is pressed.',
    },
    related: ['Toaster', 'Modal'],
  },
  {
    component: 'Progress',
    summary: 'Shows how far along something is, as a bar or a ring.',
    use: {
      when: ['Work with a known end, such as an upload', 'A usage figure against a limit'],
      instead: [
        { name: 'Spinner', why: "it takes a moment and you can't say how long" },
        { name: 'Skeleton', why: 'a page is loading' },
      ],
    },
    playground: {
      example: 'ProgressPlay',
      code: '<Progress{props} />',
      stage: 'narrow',
      knobs: [
        { prop: 'label', control: 'text', initial: 'Uploading', default: '' },
        { prop: 'value', control: 'slider', min: 0, max: 100, step: 1, initial: 64, default: -1 },
        {
          prop: 'shape',
          control: 'segmented',
          options: ['linear', 'circle'],
          initial: 'linear',
          default: 'linear',
        },
        {
          prop: 'tone',
          control: 'select',
          options: ['accent', 'neutral', 'positive', 'info', 'caution', 'critical'],
          initial: 'accent',
          default: 'accent',
        },
      ],
    },
    sections: [
      {
        kind: 'variants',
        title: 'Variants',
        examples: [
          { id: 'ProgressBar', title: 'Bar', stage: 'narrow' },
          {
            id: 'ProgressCircle',
            title: 'Ring',
            note: '`shape="circle"`. With no `value` it spins.',
          },
          {
            id: 'ProgressTones',
            title: 'Tones',
            note: 'Use `tone` to say a limit is near.',
            stage: 'narrow',
            height: 220,
          },
        ],
      },
      {
        kind: 'states',
        title: 'States',
        examples: [
          {
            id: 'ProgressIndeterminate',
            title: 'No value yet',
            note: 'Leave out `value` until you have one.',
            stage: 'narrow',
          },
          {
            id: 'ProgressRun',
            title: 'Moving',
            note: 'Change `value` and the bar follows.',
            stage: 'narrow',
            replay: true,
          },
        ],
      },
      {
        kind: 'composition',
        title: 'In context',
        examples: [
          {
            id: 'ProgressPlanUsage',
            title: 'Plan usage',
            note: 'Use `value` for how full each bar is, and `tone` to flag one that needs attention.',
            stage: 'narrow',
            height: 300,
          },
        ],
      },
    ],
    a11yNotes: [
      '`label` is required: it names the bar, and it is the text above it.',
      'With no `value`, the bar is announced as busy with its label.',
    ],
    propDocs: {
      label: 'Says what is progressing.',
      value: "From 0 to 100. Leave it out when you can't say yet.",
      shape: '`linear` or `circle`.',
      showValue: "The ring's number in the middle.",
    },
    related: ['Spinner', 'Skeleton'],
  },
]
