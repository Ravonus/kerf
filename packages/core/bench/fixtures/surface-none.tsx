import { state } from '@kerf/core'
import { render } from '@kerf/core/dom'

const level = state(1)
render(() => <div style={`width:${level.value}px`}></div>, document.body)
