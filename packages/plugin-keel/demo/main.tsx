import { render } from '@weft-js/core/dom'
import { clock } from '@weft-js/core/surface'
import { GrovePage, grove } from './Grove'
import './grove.css'

render(() => <GrovePage />, document.getElementById('app')!)
Object.assign(window, { clock, grove })
