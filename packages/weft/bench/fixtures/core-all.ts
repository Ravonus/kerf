// Every export of the `weft` entry kept alive: the framework-free core, on its own.
import * as core from 'weft'
import 'weft/keyed'

;(globalThis as any).weft = core
