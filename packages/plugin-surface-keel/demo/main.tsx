import { render } from '@weft-js/core/dom'
import { clock } from '@weft-js/core/surface'
import { colours, KeelDemo, ramps, view, world } from './KeelDemo'
import { lab, Lab } from './Lab'

const mode = new URLSearchParams(location.search).get('page') ?? 'keel'
render(() => (mode === 'lab' ? <Lab /> : <KeelDemo />), document.getElementById('app')!)
Object.assign(window, { lab, clock, keelScene: { colours, ramps, view, world, runtime: () => import('@weft-js/plugin-surface-keel/runtime') } })
