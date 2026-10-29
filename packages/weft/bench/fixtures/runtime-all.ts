// Every runtime export kept alive: the upper bound of what an app can pull in.
import * as core from 'weft'
import * as dom from 'weft/dom'

;(globalThis as any).weft = { core, dom }
