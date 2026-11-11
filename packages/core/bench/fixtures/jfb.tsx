// The js-framework-benchmark entry, for size rows (the app is in test/fixtures/next/Bench.tsx).
import { render } from '@kerf-js/core/dom'
import { Main } from '../../test/fixtures/next/Bench'

render(() => <Main />, document.getElementById('main')!)
