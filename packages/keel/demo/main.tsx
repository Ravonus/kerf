import { render } from '@kerf/core/dom'
import { clock } from '@kerf/core/surface'
import { GrovePage, grove } from './Grove'
import './grove.css'

render(() => <GrovePage />, document.getElementById('app')!)
Object.assign(window, { clock, grove })
