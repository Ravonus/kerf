import started from './getting-started'
import rules from './rules'
import props from './props'
import lists from './lists'
import later from './async'
import prices from './prices'
import kit from './ui-kit'

export type Demo = { run: () => any; title: string; look: string; tryIt: string; why: string; page?: string }

/** Every live example, with the words that say what it is. The landing, the examples page and the docs read this. */
export const demos: Record<string, Demo> = {
  'getting-started': {
    run: started, page: 'getting-started', title: 'A counter',
    look: 'A button that shows how many times it was clicked. The number is a piece of state, and the button displays it.',
    tryIt: 'Click the button.',
    why: 'If you have written React, this already reads right. The difference is that Counter ran once, so there are no hook rules or dependency lists to think about.',
  },
  rules: {
    run: rules, page: 'rules', title: 'A value worked out from other values',
    look: 'A price, a quantity, and a total. The total is never set by hand: derived works it out from the other two.',
    tryIt: 'Click price or qty and watch the total follow.',
    why: 'You say what the total is once, and it can never go stale. Most bugs in forms and carts come from keeping such values in sync by hand.',
  },
  props: {
    run: props, page: 'props', title: 'Passing data to a child',
    look: 'Cart owns the amount. Price only displays what it is given.',
    tryIt: 'Click +1. Price updates, even though neither component ran again.',
    why: 'Passing a value to a child looks the same as in React, and the child stays up to date without re-rendering.',
  },
  lists: {
    run: lists, page: 'lists', title: 'A list that keeps its rows',
    look: 'Four rows, each with a key. Rotate moves the first row to the end.',
    tryIt: 'Click Rotate.',
    why: 'Rows are moved, not rebuilt. Anything inside a row, such as typed text or a playing video, survives a reorder.',
  },
  async: {
    run: later, page: 'async', title: 'Waiting for something',
    look: 'A button that pretends to load data for 600 ms, and disables itself while it waits.',
    tryIt: 'Click it, and click again while it says Loading.',
    why: 'Async code is plain async and await. State you change after an await updates the page like any other.',
  },
  prices: {
    run: prices, title: '1,000 live prices',
    look: 'A table of 1,000 numbers. When running, one random price changes about 60 times a second.',
    tryIt: 'Press Start prices. Then watch how little else on this page is affected.',
    why: 'A live dashboard usually forces a framework to compare the whole table on each tick. Here each number has its own update, so one change costs one text write.',
  },
  'ui-kit': {
    run: kit, title: 'A form from warp',
    look: 'An email field, a switch and a button, all from warp, the UI kit that ships with weft.',
    tryIt: 'Hover the field and the button, then press Tab to move through them.',
    why: 'Forms, dialogs, tables and menus are in the box, keyboard support included, so you do not choose and wire up a component library.',
  },
}
