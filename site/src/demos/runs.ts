// The running code of each example, apart from their words: a page that only describes one shouldn't load them all.
import started from './getting-started'
import ask from './ask'
import chat from './chat'
import receipt from './receipt'
import slow from './slow'
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

export const runs: Record<string, () => unknown> = {
  'shop-1': shop1,
  'shop-2': shop2,
  'shop-3': shop3,
  'shop-4': shop4,
  'shop-5': shop5,
  'getting-started': started,
  rules: rules,
  props: props,
  lists: lists,
  async: later,
  search: search,
  prices: prices,
  shared: shared,
  habit: habit,
  'ui-kit': kit,
  chat: chat,
  slow: slow,
  receipt: receipt,
  ask: ask,
}
