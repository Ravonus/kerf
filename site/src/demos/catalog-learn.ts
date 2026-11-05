import type { Demo } from './index'

export const learn: Record<string, Demo> = {
  hello: {
    learn: true,
    title: 'Two greetings',
    look:
      'One component, Greeting, used twice ' +
      'with different props.',
    tryIt:
      'Nothing to press: read the code. ' +
      'Greeting runs once for each place it ' +
      'is used.',
    why:
      'A component is a function that ' +
      'returns TSX. It runs once, so it is ' +
      'cheap to split a page into many.',
  },
  alias: {
    learn: true,
    title: 'A prop under another name',
    look:
      'Line names its item prop with const ' +
      'and its qty prop with let. The ' +
      'parent owns qty.',
    tryIt:
      'Press +1 here twice, then +1 in the ' +
      "parent. The parent's value wins " +
      'again.',
    why:
      'const is a live, read-only name for ' +
      'a prop. let is a local you can ' +
      "change, and the parent's next change " +
      'replaces it.',
  },
  bind: {
    learn: true,
    title: 'A child that writes back',
    look:
      'Stepper changes its own value. The ' +
      'parent passes its box with bind:, so ' +
      'the change reaches the parent.',
    tryIt:
      'Press + and −. The line under the ' +
      "stepper, which reads the parent's " +
      'box, follows.',
    why:
      'Only bind: at the call site lets a ' +
      'write leave a component, so you can ' +
      'always see from the parent who may ' +
      'change its state.',
  },
  events: {
    learn: true,
    title: 'Typing and pressing',
    look:
      'An input that keeps a draft in ' +
      'state, counts its characters and ' +
      'adds a note on Enter or on the ' +
      'button.',
    tryIt:
      'Type a few words, press Enter, then ' +
      'add another with the button.',
    why:
      'Handlers are plain functions on ' +
      'onInput, onKeyDown and onClick. They ' +
      'change state, and the page follows.',
  },
  scope: {
    learn: true,
    title: 'Two components, one basket',
    look:
      'Header and Shelf are separate ' +
      'components. Both read the same ' +
      'basket, made once with defineState.',
    tryIt:
      'Add tea and cake. The badge in ' +
      'Header counts what Shelf added.',
    why:
      'State any component can reach, ' +
      'without passing it down through ' +
      'every component between.',
  },
  entries: {
    learn: true,
    title: 'One entry per row',
    look:
      'Stock is one box holding an object. ' +
      'Each row reads its own entry with ' +
      'stock.get(f).',
    tryIt:
      "Press +1 on a row. Only that row's " +
      'number changes.',
    why:
      'With get, a row re-runs only when ' +
      'its own entry changes, so a long ' +
      'list stays fast as one entry moves.',
  },
  loading: {
    learn: true,
    title: 'Waiting for data',
    look:
      'resource loads the forecast for the ' +
      'day in state. Boundary shows ' +
      'Loading… until the first one ' +
      'arrives; after that, pending dims ' +
      'the old forecast and shows a spinner ' +
      'while the next one loads.',
    tryIt:
      'Press Next day a few times quickly. ' +
      'The old forecast stays, dimmed, and ' +
      'the count shows each earlier request ' +
      'being cancelled.',
    why:
      'You write the request once. resource ' +
      'fetches again when what it read ' +
      'changes, and drops answers nobody ' +
      'wants.',
  },
  styled: {
    learn: true,
    title: 'Class and style from state',
    look:
      'A banner whose class and inline ' +
      'style both depend on a switch.',
    tryIt: 'Turn Urgent on and off.',
    why:
      'class and style are ordinary ' +
      'attributes. Like any other ' +
      'attribute, they update when what ' +
      'they read changes.',
  },
  effects: {
    learn: true,
    title: 'A stopwatch',
    look:
      'watch starts a timer when running ' +
      'turns on and stops it when it turns ' +
      'off. The input is reached through ' +
      'ref.',
    tryIt:
      'Start it, stop it, then press Select the lap.',
    why:
      'Effects are for talking to things ' +
      'outside weft, like timers and the ' +
      'DOM. Their cleanup runs for you.',
  },
}
