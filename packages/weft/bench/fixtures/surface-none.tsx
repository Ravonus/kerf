import { state } from 'weft'
import { render } from 'weft/dom'

const level = state(1)
render(() => <div style={`width:${level.value}px`}></div>, document.body)
