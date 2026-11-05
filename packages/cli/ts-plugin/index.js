// A tsserver plugin: the editor's language service sees each file's shadow, and every position in and out is mapped, so
// inferred props hover, complete and report at the source. TypeScript 7 doesn't load plugins and ignores the entry in
// tsconfig without a word, which is safe: research 44 §6 says what an editor on tsgo gets instead.

const { createContext } = require('./context.js')
const { createProxy } = require('./proxy.js')

function init({ typescript: ts }) {
  function create(info) {
    const ls = info.languageService
    const context = createContext(ts, info, ls)
    return createProxy(ts, ls, context)
  }
  return { create }
}

module.exports = init
