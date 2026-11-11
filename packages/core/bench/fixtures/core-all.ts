// Every export of the `kerf` entry kept alive: the framework-free core, on its own.
import * as core from '@kerf-js/core'
import '@kerf-js/core/keyed'

;(globalThis as any).kerf = core
