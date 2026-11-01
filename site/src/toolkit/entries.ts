// What the toolkit page says about each component: a short sentence on what it's for, in plain words.
export type Entry = { id: string; name: string; for: string; demo: string; slug: string; wide?: boolean }
export type Section = { id: string; title: string; intro: string; entries: Entry[] }

const e = (id: string, name: string, text: string, slug = id, wide = false): Entry => ({ id, name, for: text, demo: `${id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')}Demo`, slug, wide })

export const SECTIONS: Section[] = [
  {
    id: 'actions', title: 'Actions', intro: 'Things people press to make something happen.',
    entries: [
      e('button', 'Button', 'Runs an action. Use one main button per screen, and quieter ones around it.'),
      e('toggle', 'Toggle', 'A button that stays pressed, like Bold in an editor.'),
      e('chip', 'Chip', 'A small on or off filter, often with a count.'),
      e('menu', 'Menu', 'A short list of actions that opens from a button.'),
    ],
  },
  {
    id: 'forms', title: 'Forms', intro: 'Ways to ask people for something. All of them are real form controls, so they work with a plain form post.',
    entries: [
      e('input', 'Input', 'One line of text, with a label that lifts out of the way as you type.'),
      e('search', 'Search', 'An input for finding things, with a way to clear it.'),
      e('textarea', 'Textarea', 'Several lines of text. It can show how many characters are left.'),
      e('select', 'Select', 'Pick one from a list. It is a real select underneath, so forms and phones just work.'),
      e('checkbox', 'Checkbox', 'Say yes or no to one thing.'),
      e('radio', 'Radio', 'Pick exactly one from a few options you can see at once.', 'radio-group'),
      e('switch', 'Switch', 'Turn a setting on or off. It takes effect right away.'),
      e('slider', 'Slider', 'Pick a number by dragging. Arrow keys work too.'),
      e('segmented', 'Segmented', 'Choose one view from two to five, in a single row.'),
    ],
  },
  {
    id: 'navigation', title: 'Moving around', intro: 'Showing one part of a page at a time.',
    entries: [
      e('tabs', 'Tabs', 'Switch between views of the same thing.'),
      e('accordion', 'Accordion', 'Headings that open to show more, so a long page stays short.'),
    ],
  },
  {
    id: 'overlays', title: 'Overlays', intro: 'Things that open above the page. Each one traps keyboard focus when it should, closes with Escape, and hands focus back.',
    entries: [
      e('modal', 'Modal', 'Stops everything to ask one question.'),
      e('drawer', 'Drawer', 'A panel that slides in from the edge, and becomes a bottom sheet on phones.'),
      e('popover', 'Popover', 'A small panel of extra detail beside what opened it.'),
      e('tooltip', 'Tooltip', 'A short hint when you hover or focus something.'),
      e('palette', 'Command palette', 'Find any action by typing its name.', 'command-palette'),
    ],
  },
  {
    id: 'feedback', title: 'Feedback', intro: 'Telling people what just happened, or what is happening now.',
    entries: [
      e('toast', 'Toast', 'A short message that goes away by itself, and can follow a task from start to finish.'),
      e('alert', 'Alert', 'A message that stays on the page until it is dealt with.'),
      e('progress', 'Progress', 'Shows how far along something is.'),
      e('spinner', 'Spinner', 'Something is working and you cannot say how long it will take.'),
      e('skeleton', 'Skeleton', 'A placeholder shaped like the content that is on its way.'),
    ],
  },
  {
    id: 'display', title: 'Showing things', intro: 'Laying out what you already have.',
    entries: [
      e('table', 'Table', 'Rows of data you can sort and read. On phones it turns into cards.', 'table', true),
      e('ticker', 'Ticker', 'A number that rolls to its new value, so a change is easy to notice.'),
      e('card', 'Card', 'Groups one topic into a box.'),
      e('badge', 'Badge, Tag and Kbd', 'Small labels: a status, a topic, a keyboard key.'),
    ],
  },
]

export const CANVAS: Section = {
  id: 'dithering', title: 'Canvas and dithering',
  intro: 'Dithering draws an image with a few inks and a pattern of dots, like an old print. These use warp\'s own colours, change with the theme, hold still for anyone who prefers less motion, and pause when they scroll off the page.',
  entries: [
    e('dither-field', 'DitherField', 'A live pattern to use as a background. It can react to the pointer.', 'dither-field', true),
    e('dither', 'Dither', 'Turns an image or a gradient into a still dithered picture.', 'dither', true),
    e('dither-glyph', 'DitherGlyph', 'Weaves a word or a logo out of a dithered pattern. The word stays real text for screen readers and search.', 'dither-glyph', true),
    e('canvas', 'Canvas', 'A blank canvas for your own drawing. Sharp screens, resizing and pausing off-screen are handled for you.', 'canvas', true),
  ],
}

export const PACKS: [string, string][] = [
  ['Agent', 'Chat, tool calls and citations, for apps with an AI assistant.'],
  ['Admin', 'Settings pages, plans, members and the screens around them.'],
  ['Collaboration', 'Comments, presence and sharing, for apps people use together.'],
  ['Schedule', 'Calendars, agendas and booking.'],
  ['Live', 'Feeds, notifications and things that update on their own.'],
  ['Flow', 'Sign-in, checkout and other step-by-step journeys.'],
  ['Charts', 'Bar, line, area and more, all using the same colours and tooltips.'],
  ['Data', 'Grids, virtual lists and tables for large amounts of data.'],
  ['Dates and time', 'Date, time and duration fields, and calendars.'],
  ['Inputs', 'Richer fields: phone, address, payment card, signature, code and text editors.'],
  ['Layout', 'Stacks, grids and the app shell around your pages.'],
]
