// Every runtime export kept alive: the upper bound of what an app can pull in.
import * as core from '@kerf/core'
import * as dom from '@kerf/core/dom'

;(globalThis as any).kerf = { core, dom }
