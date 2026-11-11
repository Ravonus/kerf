import { state } from '@kerf-js/core'
import { render } from '@kerf-js/core/dom'

const level = state(1)
render(() => <div style={`width:${level.value}px`}></div>, document.body)
