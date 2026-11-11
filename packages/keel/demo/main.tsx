import { render } from '@kerf-js/core/dom'
import { clock } from '@kerf-js/core/surface'
import { GrovePage, grove } from './Grove'
import './grove.css'

render(() => <GrovePage />, document.getElementById('app')!)
Object.assign(window, { clock, grove })
