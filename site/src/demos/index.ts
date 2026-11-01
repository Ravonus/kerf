import started from './getting-started'
import rules from './rules'
import props from './props'
import lists from './lists'
import later from './async'
import prices from './prices'
import kit from './ui-kit'
import search from './search'
import shared from './shared'
import habit from './habit'
import shop1 from './shop-1'
import shop2 from './shop-2'
import shop3 from './shop-3'
import shop4 from './shop-4'
import shop5 from './shop-5'

export type Demo = { run: () => any; title: string; look: string; tryIt: string; why: string; page?: string }

/** Every live example, with the words that say what it is. The landing, the examples page and the docs read this. */
export const demos: Record<string, Demo> = {
  'shop-1': {
    run: shop1, title: 'The shop, step 1',
    look: 'One product and an add-to-cart button. count is state: a value the page shows and can change.',
    tryIt: 'Press Add to cart. The badge counts up.',
    why: 'This is a plain function returning TSX, so what you know from React carries over. Shop runs once, so there are no hook rules or dependency lists.',
  },
  'shop-2': {
    run: shop2, title: 'The shop, step 2',
    look: 'The total and shipping are new, marked in the code. Neither is set by hand: derived works each one out from count.',
    tryIt: 'Add three coffees and watch shipping drop to $0 as the total passes $36.',
    why: 'You state a rule once and it can never go stale. Carts and forms get most of their bugs from keeping values like these in sync by hand.',
  },
  'shop-3': {
    run: shop3, title: 'The shop, step 3',
    look: 'Now three products, each with its own count. The list is an ordinary .map, and the total adds them up.',
    tryIt: 'Add a grinder, then a filter. Only that row and the total change.',
    why: 'A click updates the one badge and the total, not the list around them, however long it gets. You write no memo or optimisation to get that.',
  },
  'shop-4': {
    run: shop4, title: 'The shop, step 4',
    look: 'A search box. shown is derived from what you type, in one line of ordinary JavaScript.',
    tryIt: 'Add a coffee, type gr, then clear the box. Your count is still there.',
    why: 'There is nothing to wire up: no effect, no event bus. Rows keep their state when they leave the list and come back.',
  },
  'shop-5': {
    run: shop5, title: 'The shop, step 5',
    look: 'A checkout form from warp, so the shop now has a labelled field, a switch and a submit button.',
    tryIt: 'Press Tab to move through the controls, then place the order.',
    why: 'Forms, dialogs, tables and menus are in the box with keyboard support, so you do not pick and wire up a component library.',
  },
  'getting-started': {
    run: started, title: 'An add-to-cart button',
    look: 'A product card. inCart is a piece of state: a value the page shows and can change.',
    tryIt: 'Press Add to cart and watch the badge count up.',
    why: 'If you have written React, this already reads right. The difference is that Product ran once, so there are no hook rules or dependency lists to think about.',
  },
  rules: {
    run: rules, page: 'rules', title: 'A basket that adds itself up',
    look: 'A quantity, plus shipping and a total that are worked out from it. Shipping turns free at three items.',
    tryIt: 'Press Add one three times and watch shipping and the total change together.',
    why: 'You say what the total is once, and it can never go stale. Most bugs in forms and carts come from keeping such values in sync by hand.',
  },
  props: {
    run: props, page: 'props', title: 'Passing data to a child',
    look: 'Tip owns the bill. Price is a separate component that only displays the number it is given.',
    tryIt: 'Press Add a $10 dish. Price updates, though neither component ran again.',
    why: 'Passing a value to a child looks the same as in React, and the child stays up to date without re-rendering.',
  },
  lists: {
    run: lists, page: 'lists', title: 'A list that keeps its rows',
    look: 'A to-do list where each row has a key, so weft knows which row is which.',
    tryIt: 'Tick Grind, then press Do the first one later a few times. The tick stays with its row.',
    why: 'Rows are moved, not rebuilt. Anything inside a row, such as a tick, typed text or a playing video, survives a reorder.',
  },
  async: {
    run: later, page: 'async', title: 'Saving to a server',
    look: 'A save button that waits 800 ms, standing in for a real request, and disables itself meanwhile.',
    tryIt: 'Press Save changes, and try pressing again while it spins.',
    why: 'Async code is plain async and await. State you change after an await updates the page like any other.',
  },
  search: {
    run: search, title: 'A search filter',
    look: 'A list of cities and a box that narrows it. The matches are worked out from what you type.',
    tryIt: 'Type os, then clear the box.',
    why: 'Filtering is one line of ordinary JavaScript. The list updates on every key without any wiring from you.',
  },
  prices: {
    run: prices, title: 'A live market table',
    look: 'A table of 1,000 prices. When live, one random price changes about 60 times a second.',
    tryIt: 'Press Go live, then scroll the table or use the rest of this page.',
    why: 'A live dashboard usually forces a framework to compare the whole table on each tick. Here each number has its own update, so one change costs one text write.',
  },
  shared: {
    run: shared, title: 'Two views of one list',
    look: 'Ana and Ben see the same list. Here both panes are in your browser and share one piece of state, so nothing crosses a network.',
    tryIt: 'Add a task in either pane, and tick a box.',
    why: 'New tasks appear in both panes with no sync code. With @weft/start the list comes from a server query, and `.live()` keeps other visitors in step the same way.',
  },
  habit: {
    run: habit, title: 'A React habit, caught by the compiler',
    look: 'A real error from the weft compiler for state(props.value), which copies a prop once. That is fine in some frameworks and a silent bug here.',
    tryIt: 'Press the button to see the message the compiler gives.',
    why: 'Mistakes you bring from other frameworks stop the build with a reason and a fix, instead of shipping and going stale later. Your agent reads the same message.',
  },
  'ui-kit': {
    run: kit, title: 'A form from warp',
    look: 'A billing form: email field, switch and button, all from warp, the UI kit that ships with weft.',
    tryIt: 'Hover the field and the button, then press Tab to move through them.',
    why: 'Forms, dialogs, tables and menus are in the box, keyboard support included, so you do not choose and wire up a component library.',
  },
}
