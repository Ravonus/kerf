// Every runtime export kept alive: the upper bound of what an app can pull in.
import * as core from '@weft-js/core'
import * as dom from '@weft-js/core/dom'

;(globalThis as any).weft = { core, dom }
