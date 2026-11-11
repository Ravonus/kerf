// The site's client entry: start(), and veneer.flow armed for every page. Flow moves the page's own `data-flow` markup,
// most of it static, so the page arms it here rather than the islands, which can then wait (hydration.json H010).
import { start } from '@kerf-js/start/client'
import { flow } from '@kerf-js/veneer-core'
import * as routes from 'virtual:kerf/routes'

flow()
void start(routes)
