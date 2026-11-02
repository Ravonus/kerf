import type { DocGroup } from '../types.ts'

export const feedback: DocGroup = {
  file: 'feedback',
  title: 'Feedback',
  intro: 'Telling people what just happened, or what is happening now.',
  docs: [
    {
      component: 'Toaster',
      summary: 'Where toasts appear: short messages that come and go on their own.',
      use: {
        when: ['Confirming something people just did', 'News that doesn\'t need an answer'],
        instead: [{ name: 'Alert', why: 'it has to stay on the page until it is dealt with' }, { name: 'Modal', why: 'people must answer before going on' }],
      },
      playground: {
        example: 'ToasterPlay',
        code: 'toast.show({ title, description, tone, action })\n\n<Toaster />',
        knobs: [
          { prop: 'title', control: 'text', initial: 'Deploy finished', default: '' },
          { prop: 'description', control: 'text', initial: 'storefront is live in eu-west.', default: '' },
          { prop: 'tone', control: 'select', options: ['neutral', 'accent', 'positive', 'info', 'caution', 'critical'], initial: 'positive', default: 'neutral' },
          { prop: 'action', control: 'switch', label: 'With an action', initial: false, default: false },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'ToasterBasic', title: 'A confirmation', note: 'Mount one `Toaster` near the root, then call `toast.show` from anywhere.' },
          { id: 'ToasterPosition', title: 'Position', note: 'Use `position` on `Toaster` to pick the corner.', height: 200 },
          { id: 'ToasterTones', title: 'Tones', note: 'Each `tone` brings its own icon.' },
          { id: 'ToasterUndo', title: 'With an action', note: 'An `action` gives people ten seconds to take it.' },
        ] },
        { kind: 'states', title: 'States', examples: [
          { id: 'ToasterPromise', title: 'Following a promise', note: '`toast.promise` shows one toast from pending to done, in place.' },
          { id: 'ToasterSeveral', title: 'Several at once', note: 'Three stack up, and fan out on hover. Hovering pauses every timer.' },
          { id: 'ToasterDismissed', title: 'Closing from code', note: '`duration: 0` keeps it up until `toast.dismiss` with the id `toast.show` returned.' },
          { id: 'ToasterAfterRedirect', title: 'On arrival', note: 'Fire one as a page mounts, to finish what the last page started.', replay: true },
        ] },
      ],
      keyboard: [['F8', 'Moves focus to the newest toast'], ['Esc', 'Leaves the toasts']],
      a11yNotes: ['Toasts are read out through a live region that is on the page from the start.', 'Hovering or focusing the stack pauses every timer.', 'A critical toast with an action stays until it is dismissed.'],
      related: ['Alert', 'Progress', 'Button'],
    },
    {
      component: 'Alert',
      summary: 'A message that stays in the page until it is dealt with.',
      use: {
        when: ['Something people should know about this part of the page', 'A form error that has just happened'],
        instead: [{ name: 'Toaster', why: 'it is a passing confirmation' }, { name: 'Modal', why: 'people can\'t go on until they answer' }],
      },
      playground: {
        example: 'AlertPlay',
        code: '<Alert{props}>{children}</Alert>',
        stage: 'fill',
        knobs: [
          { prop: 'title', control: 'text', initial: 'Deploy failed', default: '' },
          { prop: 'children', control: 'text', label: 'Text', initial: 'mobile-bff stopped at the health check.', default: '' },
          { prop: 'tone', control: 'select', options: ['info', 'neutral', 'accent', 'positive', 'caution', 'critical'], initial: 'critical', default: 'info' },
          { prop: 'live', control: 'switch', initial: false, default: false },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'AlertTones', title: 'Tones', note: 'Icon and words carry the meaning, so it never depends on colour.', stage: 'fill', height: 360 },
          { id: 'AlertTitleOnly', title: 'Title only', note: 'An alert needs only a `title` when nothing more has to be said.', stage: 'fill' },
          { id: 'AlertBodyOnly', title: 'Text only', note: 'An alert can carry just text, with no `title`.', stage: 'fill' },
          { id: 'AlertWithActions', title: 'With actions', note: 'Use `actions` to add buttons under the message.', stage: 'fill' },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'AlertDismiss', title: 'Dismissible', note: '`onDismiss` adds the close button. You remove the alert.', stage: 'fill' }] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'AlertFormError', title: 'A form error', note: 'Press Add domain with the box empty. `live` announces it.', stage: 'narrow', height: 300 },
          { id: 'AlertUsage', title: 'Close to a limit', note: 'An alert with `tone` set to `caution` and an `actions` button warns about a limit and offers a fix.', stage: 'fill' },
        ] },
      ],
      a11yNotes: ['`live` sets `role="alert"`, which interrupts screen readers. Keep it for new errors.', 'An alert on the page at load is not announced.'],
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
        instead: [{ name: 'Spinner', why: 'it takes a moment and you can\'t say how long' }, { name: 'Skeleton', why: 'a page is loading' }],
      },
      playground: {
        example: 'ProgressPlay',
        code: '<Progress{props} />',
        stage: 'narrow',
        knobs: [
          { prop: 'label', control: 'text', initial: 'Uploading', default: '' },
          { prop: 'value', control: 'slider', min: 0, max: 100, step: 1, initial: 64, default: -1 },
          { prop: 'shape', control: 'segmented', options: ['linear', 'circle'], initial: 'linear', default: 'linear' },
          { prop: 'tone', control: 'select', options: ['accent', 'neutral', 'positive', 'info', 'caution', 'critical'], initial: 'accent', default: 'accent' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'ProgressBar', title: 'Bar', stage: 'narrow' },
          { id: 'ProgressCircle', title: 'Ring', note: '`shape="circle"`. With no `value` it spins.' },
          { id: 'ProgressTones', title: 'Tones', note: 'Use `tone` to say a limit is near.', stage: 'narrow', height: 220 },
        ] },
        { kind: 'states', title: 'States', examples: [
          { id: 'ProgressIndeterminate', title: 'No value yet', note: 'Leave out `value` until you have one.', stage: 'narrow' },
          { id: 'ProgressRun', title: 'Moving', note: 'Change `value` and the bar follows.', stage: 'narrow', replay: true },
        ] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'ProgressPlanUsage', title: 'Plan usage', note: 'Use `value` for how full each bar is, and `tone` to flag one that needs attention.', stage: 'narrow', height: 300 }] },
      ],
      a11yNotes: ['`label` is required: it names the bar, and it is the text above it.', 'With no `value`, the bar is announced as busy with its label.'],
      propDocs: {
        label: 'Says what is progressing.',
        value: 'From 0 to 100. Leave it out when you can\'t say yet.',
        shape: '`linear` or `circle`.',
        showValue: 'The ring\'s number in the middle.',
      },
      related: ['Spinner', 'Skeleton'],
    },
    {
      component: 'Spinner',
      summary: 'Shows that something is working, when you can\'t say how long it will take.',
      use: {
        when: ['A short wait of unknown length', 'A small area is busy'],
        instead: [{ name: 'Progress', why: 'you know how far along it is' }, { name: 'Skeleton', why: 'you know the shape of what is coming' }, { name: 'Button', why: 'the button itself started it: use loading' }],
      },
      playground: {
        example: 'SpinnerPlay',
        code: '<Spinner{props} />',
        knobs: [
          { prop: 'size', control: 'segmented', options: ['sm', 'md', 'lg'], initial: 'md', default: 'md' },
          { prop: 'label', control: 'text', initial: 'Loading', default: '' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'SpinnerSizes', title: 'Sizes' },
          { id: 'SpinnerInline', title: 'Beside text', note: 'With words next to it, leave out `label`: it is then decorative.' },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'SpinnerRefresh', title: 'Refreshing', note: 'A spinner with a `label` stands in for a button while a refresh runs.', stage: 'narrow' },
          { id: 'SpinnerPanel', title: 'A waiting panel', note: 'Use `size` set to `lg` for a spinner that fills a waiting panel.', stage: 'narrow', height: 220 },
        ] },
      ],
      a11yNotes: ['`label` makes it a named status. Without one it is hidden from screen readers.', 'Under reduced motion it pulses instead of turning.'],
      propDocs: { label: 'Names it for screen readers. Leave it out if there are words beside it.', size: '`sm`, `md` or `lg`.' },
      related: ['Progress', 'Skeleton', 'Button'],
    },
    {
      component: 'Skeleton',
      summary: 'A grey placeholder where content will appear.',
      use: {
        when: ['Building your own loading state, piece by piece'],
        instead: [{ name: 'Shape', why: 'the content is a plain list, card or table' }, { name: 'Spinner', why: 'you don\'t know the shape of what is coming' }],
      },
      playground: {
        example: 'SkeletonPlay',
        code: '<Skeleton{props} />',
        stage: 'narrow',
        knobs: [
          { prop: 'shape', control: 'segmented', options: ['text', 'circle', 'block'], initial: 'text', default: 'text' },
          { prop: 'lines', control: 'slider', min: 1, max: 6, step: 1, initial: 3, default: 1 },
          { prop: 'width', control: 'text', initial: '', default: '' },
          { prop: 'height', control: 'text', initial: '', default: '' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'SkeletonShapes', title: 'Shapes', stage: 'narrow', height: 240 },
          { id: 'SkeletonLines', title: 'Lines', note: '`lines` stacks text lines. The last is shorter.', stage: 'narrow' },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'SkeletonProfile', title: 'A person row', note: 'Use `shape` and `width` to sketch a person row while it loads.' },
          { id: 'SkeletonThenContent', title: 'Then the content', note: 'Match the content\'s size, so nothing jumps.', stage: 'narrow', replay: true },
        ] },
      ],
      a11yNotes: ['Skeletons say nothing to screen readers. Put `aria-busy` on the region, or use Shape, which does it for you.', 'Under reduced motion they stay still.'],
      propDocs: { shape: '`text`, `circle` or `block`.', lines: 'How many text lines.', width: 'Any CSS length.', height: 'Any CSS length.' },
      related: ['Shape', 'Spinner'],
    },
    {
      component: 'Shape',
      summary: 'A ready-made loading placeholder for a list, card, table or block of text.',
      use: {
        when: ['As the pending of a Boundary', 'Any loading state that looks like a list, card or table'],
        instead: [{ name: 'Skeleton', why: 'the layout is unusual and you need to build it by hand' }],
      },
      playground: {
        example: 'ShapePlay',
        code: '<Shape{props} />',
        stage: 'narrow',
        height: 280,
        knobs: [
          { prop: 'kind', control: 'segmented', options: ['text', 'list', 'card', 'media', 'table'], initial: 'list', default: 'text' },
          { prop: 'rows', control: 'slider', min: 1, max: 8, step: 1, initial: 3, default: 3, when: { prop: 'kind', is: ['list', 'table'] } },
          { prop: 'lines', control: 'slider', min: 1, max: 6, step: 1, initial: 3, default: 3, when: { prop: 'kind', is: ['text', 'card'] } },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'ShapeList', title: 'List', note: '`avatar={false}` drops the circle.', stage: 'narrow', height: 220 },
          { id: 'ShapeParagraph', title: 'Text', note: 'Use `kind="text"` with `lines` to draw a placeholder paragraph.', stage: 'narrow' },
          { id: 'ShapeTile', title: 'Card', note: '`media` is the picture\'s ratio. Leave it out for none.', stage: 'narrow', height: 340 },
          { id: 'ShapeTable', title: 'Table', note: 'Use `kind="table"` with `rows` and `cols` to draw a placeholder table.', stage: 'fill', height: 240 },
          { id: 'ShapeMedia', title: 'Media', note: 'Use `kind="media"` with `media` to draw a placeholder image at a set ratio.', stage: 'fill', height: 260 },
        ] },
        { kind: 'composition', title: 'In context', examples: [
          { id: 'ShapeBoundary', title: 'Waiting on data', note: 'Give it the content\'s counts, so the swap moves nothing.', stage: 'narrow', height: 200, replay: true },
        ] },
      ],
      a11yNotes: ['It is a busy status named by `label`, and nothing inside it can be focused.'],
      propDocs: {
        label: 'What screen readers hear.',
        kind: 'Which layout: `text`, `list`, `card`, `media` or `table`.',
        lines: 'Text and card: lines of body text.',
        rows: 'List and table: how many rows.',
        cols: 'Table: how many columns.',
        media: 'Card and media: the ratio, like `"16/9"`.',
        avatar: 'List: a circle at the start of each row.',
      },
      related: ['Skeleton', 'Spinner'],
    },
    {
      component: 'LiveStatus',
      summary: 'A small pill saying whether a live connection is working.',
      use: {
        when: ['Anything that streams, syncs or updates by itself'],
        instead: [{ name: 'Badge', why: 'it is a fixed status, not a connection' }, { name: 'Alert', why: 'the connection has been lost and people must act' }],
      },
      playground: {
        example: 'LiveStatusPlay',
        code: '<LiveStatus{props} />',
        knobs: [
          { prop: 'state', control: 'segmented', options: ['connecting', 'live', 'reconnecting', 'offline'], initial: 'live', default: '' },
          { prop: 'label', control: 'text', initial: 'Log stream', default: '' },
          { prop: 'children', control: 'text', label: 'Words', initial: '', default: '' },
        ],
      },
      sections: [
        { kind: 'variants', title: 'Variants', examples: [
          { id: 'LiveStatusStates', title: 'States', note: 'Quiet while live, loud only in trouble.' },
          { id: 'LiveStatusWords', title: 'Your own words', note: 'Children replace the default word.' },
        ] },
        { kind: 'states', title: 'States', examples: [{ id: 'LiveStatusDrop', title: 'Losing the connection', note: 'Pass the state you have, and it follows.' }] },
        { kind: 'composition', title: 'In context', examples: [{ id: 'LiveStatusHeader', title: 'A panel header', note: 'Use `state` and `label` to show whether a stream is live beside a heading.', stage: 'narrow' }] },
      ],
      a11yNotes: ['It is a live status, so changes are announced. `label` says what the connection is for.'],
      propDocs: { state: 'The connection: `connecting`, `live`, `reconnecting` or `offline`.', label: 'What is connected, for screen readers: "Log stream: live".', children: 'Replaces the default word.' },
      related: ['Badge', 'Alert'],
    },
  ],
}
