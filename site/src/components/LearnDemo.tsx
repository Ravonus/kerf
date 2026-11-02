import Alias from '../demos/alias'
import Later from '../demos/async'
import Bind from '../demos/bind'
import Effects from '../demos/effects'
import Entries from '../demos/entries'
import Events from '../demos/events'
import Product from '../demos/getting-started'
import Hello from '../demos/hello'
import Lists from '../demos/lists'
import Loading from '../demos/loading'
import Props from '../demos/props'
import Rules from '../demos/rules'
import Scope from '../demos/scope'
import Search from '../demos/search'
import Shared from '../demos/shared'
import Styled from '../demos/styled'
import UiKit from '../demos/ui-kit'
import UiState from '../demos/ui-state'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '../styles/example.css'

/**
 * A Learn page's live demo. One JSX site per demo, as in PageExample: each is then an island the server renders, and a
 * press before its code has loaded is held and replayed.
 */
export function LearnDemo(props: { id: string }) {
  return (
    <div data-part="run">
      {props.id === 'getting-started' && <Product />}
      {props.id === 'hello' && <Hello />}
      {props.id === 'props' && <Props />}
      {props.id === 'alias' && <Alias />}
      {props.id === 'lists' && <Lists />}
      {props.id === 'search' && <Search />}
      {props.id === 'events' && <Events />}
      {props.id === 'bind' && <Bind />}
      {props.id === 'rules' && <Rules />}
      {props.id === 'scope' && <Scope />}
      {props.id === 'shared' && <Shared />}
      {props.id === 'entries' && <Entries />}
      {props.id === 'ui-state' && <UiState />}
      {props.id === 'loading' && <Loading />}
      {props.id === 'async' && <Later />}
      {props.id === 'styled' && <Styled />}
      {props.id === 'ui-kit' && <UiKit />}
      {props.id === 'effects' && <Effects />}
    </div>
  )
}
