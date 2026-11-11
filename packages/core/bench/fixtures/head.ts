// The client tag writer the router will call on navigation (research 20 §3), on its own.
import { setHead } from '@kerf/core/head'

;(globalThis as any).setHead = setHead
