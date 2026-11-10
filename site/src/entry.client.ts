// The site's client entry: start(), and warp.flow armed for every page. Flow moves the page's own `data-flow` markup,
// most of it static, so the page arms it here rather than the islands, which can then wait (hydration.json H010).
import { start } from '@weft-js/start/client'
import { flow } from '@weft-js/warp-core'
import * as routes from 'virtual:weft/routes'

flow()
void start(routes)
