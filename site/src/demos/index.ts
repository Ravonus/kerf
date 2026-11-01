
export type Demo = { title: string; look: string; tryIt: string; why: string; page?: string }

/** Every live example, with the words that say what it is. The landing, the examples page and the docs read this. */
export const demos: Record<string, Demo> = {
  'shop-1': {
    title: 'The shop, step 1',
    look: 'One product and an add-to-cart button. count is state: a value the page shows and can change.',
    tryIt: 'Press Add to cart. The badge counts up.',
    why: 'This is a plain function returning TSX, so what you know from React carries over. Shop runs once, so there are no hook rules or dependency lists.',
  },
  'shop-2': {
    title: 'The shop, step 2',
    look: 'The total and shipping are new, marked in the code. Neither is set by hand: derived works each one out from count.',
    tryIt: 'Add three coffees. Shipping appears at $4, then drops to $0 when the total reaches $36.',
    why: 'You state a rule once and it can never go stale. Carts and forms get most of their bugs from keeping values like these in sync by hand.',
  },
  'shop-3': {
    title: 'The shop, step 3',
    look: 'Now three products, each with its own count. The list is an ordinary .map, and the total adds them up.',
    tryIt: 'Add a grinder, then a filter. Only that row and the total change.',
    why: 'A click updates the one badge and the total, not the list around them, however long it gets. You write no memo or optimisation to get that.',
  },
  'shop-4': {
    title: 'The shop, step 4',
    look: 'A search box. shown is derived from what you type, and the filter is one line of ordinary JavaScript.',
    tryIt: 'Add a coffee, type gr, then clear the box. Your count is still there.',
    why: 'There is nothing to wire up: no effect, no event bus. Each count lives with its product, so it is still there when the row comes back.',
  },
  'shop-5': {
    title: 'The shop, step 5',
    look: 'A checkout form from warp, so the shop now has a labelled field, a switch and a submit button.',
    tryIt: 'Add something, press Tab to move through the controls, then place the order. The button stays off while the cart is empty.',
    why: 'Forms, dialogs, tables and menus are in the box with keyboard support, so you do not pick and wire up a component library.',
  },
  'getting-started': {
    title: 'An add-to-cart button',
    look: 'A product card. inCart is a piece of state: a value the page shows and can change.',
    tryIt: 'Press Add to cart and watch the badge count up.',
    why: 'If you have written React, this already reads right. The difference is that Product ran once, so there are no hook rules or dependency lists to think about.',
  },
  rules: {
    page: 'rules', title: 'A basket that adds itself up',
    look: 'A quantity, plus shipping and a total that are worked out from it. Shipping turns free at three items.',
    tryIt: 'Press Add one twice. At three items shipping drops to $0 and the total changes with it.',
    why: 'You say what the total is once, and it can never go stale. Most bugs in forms and carts come from keeping such values in sync by hand.',
  },
  props: {
    page: 'props', title: 'Passing data to a child',
    look: 'Tip owns the bill. Price is a separate component that only displays the number it is given.',
    tryIt: 'Press Add a $10 dish. Price updates, though neither component ran again.',
    why: 'Passing a value to a child looks the same as in React, and the child stays up to date without re-rendering.',
  },
  lists: {
    page: 'lists', title: 'A list that keeps its rows',
    look: 'A to-do list where each row has a key, so weft knows which row is which.',
    tryIt: 'Tick Grind, then press Do the first one later a few times. The tick stays with its row.',
    why: 'Rows are moved, not rebuilt, so what is inside a row, such as a tick or typed text, survives a reorder.',
  },
  async: {
    page: 'async', title: 'Saving to a server',
    look: 'A save button that waits 800 ms, standing in for a real request, and disables itself meanwhile.',
    tryIt: 'Press Save changes, and try pressing again while it spins.',
    why: 'Async code is plain async and await. State you change after an await updates the page like any other.',
  },
  search: {
    title: 'A search filter',
    look: 'A list of cities and a box that narrows it. The matches are worked out from what you type.',
    tryIt: 'Type os, then clear the box.',
    why: 'Filtering is one line of ordinary JavaScript. The list updates on every key without any wiring from you.',
  },
  prices: {
    title: 'A live market table',
    look: 'A table of 1,000 prices. When live, one random price changes about 60 times a second.',
    tryIt: 'Press Go live, then scroll the table or use the rest of this page.',
    why: 'A live dashboard usually forces a framework to compare the whole table on each tick. Here each number has its own update, so one change costs one text write.',
  },
  'ui-state': {
    page: 'ui-state', title: 'Hover shared across tabs',
    look: 'Two panes showing one list, like Two views of one list below, but what they share here is hover. Each row is one interaction, drawn by warp. Nothing here adds a listener.',
    tryIt: 'Hover a row: both panes light. Open this page in a second tab and hover there: this tab lights too and says who is elsewhere.',
    why: 'Hover stops being a pile of handlers and becomes a value you can read, draw and share. Your own hover never fires for someone else, so logic on it cannot echo.',
  },
  shared: {
    title: 'Two views of one list',
    look: 'Ana and Ben see the same list. Here both panes are in your browser and share the same state, so nothing crosses a network.',
    tryIt: 'Add a task in either pane, then tick a box. It ticks in the other pane too.',
    why: 'Tasks and ticks show in both panes with no sync code. With @weft/start the list comes from a server query, and .live() keeps other visitors in step the same way.',
  },
  habit: {
    title: 'A React habit, caught by the compiler',
    look: 'A real error from the weft compiler for state(props.value), which copies a prop once. That is fine in some frameworks and a silent bug here.',
    tryIt: 'Press the button to see the message the compiler gives.',
    why: 'Mistakes you bring from other frameworks stop the build with a reason and a fix, instead of shipping and going stale later. Your agent reads the same message.',
  },
  'ui-kit': {
    title: 'A form from warp',
    look: 'A billing form: email field, switch and button, all from warp, the UI kit that ships with weft.',
    tryIt: 'Hover the field and the button, then press Tab to move through them.',
    why: 'Forms, dialogs, tables and menus are in the box, keyboard support included, so you do not choose and wire up a component library.',
  },
  chat: {
    title: 'Chat that survives a cut wire',
    look: 'A real WebSocket to this site\'s server, in a room made just for you. The code is the page; the channel and its authorize check are in src/server/chat.ts.',
    tryIt: 'Join and send a message. While the server is replying, cut the wire, wait a few seconds, then restore it. The replies you missed arrive in order.',
    why: 'Reconnecting and catching up take no code here: status, resume and the message list come with channel. A channel without authorize is an error, not a bug you find later.',
  },
  slow: {
    title: 'A slow page with an instant shell',
    look: 'A real page from this server, in a frame. Its data takes as long as you choose. The code is that page.',
    tryIt: 'Pick 3 s. The card appears at once, stock fills in at 1.5 s and reviews at 3 s.',
    why: 'load returns its promises without waiting, so the server sends the page first and streams each value in as it\'s ready. Each Boundary says what to show until then.',
  },
  receipt: {
    title: 'The shop, itemised',
    look: 'What the shop app in the repo evals sends to the browser, in compressed JavaScript. Measured by evals/warp-exit.mjs with brotli; the app and the results are in the repo.',
    tryIt: 'Compare it with the download sizes on the home page, which measure a larger dashboard.',
    why: 'You pay for the components you use. A page that imports a button doesn\'t bring the rest of warp with it.',
  },
  ask: {
    title: 'Ask the app',
    look: 'A small todo app above its reactive graph. The JSON is what graph() from weft/devtools returns. Development builds only: this frame is one.',
    tryIt: 'Press Add a task, then Finish one. Only the lines that changed light up.',
    why: 'An agent sees the same JSON through weft mcp, with your real names, so it can check what depends on what instead of guessing.',
  },
}
