import { state } from '@weft-js/core'
import { render } from '@weft-js/core/dom'

const level = state(1)
render(() => <div style={`width:${level.value}px`}></div>, document.body)
