// Every runtime export kept alive: the upper bound of what an app can pull in.
import * as core from '@kerf-js/core'
import * as dom from '@kerf-js/core/dom'

;(globalThis as any).kerf = { core, dom }
