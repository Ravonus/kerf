// Every export of the `weft` entry kept alive: the framework-free core, on its own.
import * as core from '@weft-js/core'
import '@weft-js/core/keyed'

;(globalThis as any).weft = core
