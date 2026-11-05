import DemoAlias from '../demos/alias'
import DemoAsync from '../demos/async'
import DemoBind from '../demos/bind'
import DemoDescribeBraces from '../demos/describe-braces'
import DemoDescribeChildren from '../demos/describe-children'
import DemoDescribeGallery from '../demos/describe-gallery'
import DemoDescribeKeys from '../demos/describe-keys'
import DemoDescribeMarkup from '../demos/describe-markup'
import DemoDescribeMounted from '../demos/describe-mounted'
import DemoDescribePacking from '../demos/describe-packing'
import DemoDescribePeople from '../demos/describe-people'
import DemoDescribeRuns from '../demos/describe-runs'
import DemoDescribeTree from '../demos/describe-tree'
import DemoEffects from '../demos/effects'
import DemoEntries from '../demos/entries'
import DemoEscapeBrowser from '../demos/escape-browser'
import DemoEscapeDebounce from '../demos/escape-debounce'
import DemoEscapeFilter from '../demos/escape-filter'
import DemoEscapeFocus from '../demos/escape-focus'
import DemoEscapeForward from '../demos/escape-forward'
import DemoEscapeKeyed from '../demos/escape-keyed'
import DemoEscapeMeasure from '../demos/escape-measure'
import DemoEscapeOwner from '../demos/escape-owner'
import DemoEscapePointer from '../demos/escape-pointer'
import DemoEscapeRefresh from '../demos/escape-refresh'
import DemoEscapeReserve from '../demos/escape-reserve'
import DemoEscapeRetry from '../demos/escape-retry'
import DemoEscapeRoom from '../demos/escape-room'
import DemoEscapeRoot from '../demos/escape-root'
import DemoEscapeScroll from '../demos/escape-scroll'
import DemoEscapeShape from '../demos/escape-shape'
import DemoEscapeStream from '../demos/escape-stream'
import DemoEscapeSurface from '../demos/escape-surface'
import DemoEvents from '../demos/events'
import DemoGettingStarted from '../demos/getting-started'
import DemoHello from '../demos/hello'
import DemoInteractBindInput from '../demos/interact-bind-input'
import DemoInteractControls from '../demos/interact-controls'
import DemoInteractFlush from '../demos/interact-flush'
import DemoInteractGallery from '../demos/interact-gallery'
import DemoInteractInstances from '../demos/interact-instances'
import DemoInteractNested from '../demos/interact-nested'
import DemoInteractPerson from '../demos/interact-person'
import DemoInteractPropagation from '../demos/interact-propagation'
import DemoInteractRuns from '../demos/interact-runs'
import DemoInteractSubmit from '../demos/interact-submit'
import DemoInteractThree from '../demos/interact-three'
import DemoInteractTodosStep1 from '../demos/interact-todos-step-1'
import DemoInteractTodosStep2 from '../demos/interact-todos-step-2'
import DemoInteractTodosStep3 from '../demos/interact-todos-step-3'
import DemoInteractToolbar from '../demos/interact-toolbar'
import DemoLoading from '../demos/loading'
import DemoManageAccordion from '../demos/manage-accordion'
import DemoManageChain from '../demos/manage-chain'
import DemoManageContext from '../demos/manage-context'
import DemoManageInteraction from '../demos/manage-interaction'
import DemoManageKeep from '../demos/manage-keep'
import DemoManageQuiz from '../demos/manage-quiz'
import DemoManageReset from '../demos/manage-reset'
import DemoManageRows from '../demos/manage-rows'
import DemoManageSelected from '../demos/manage-selected'
import DemoManageStates from '../demos/manage-states'
import DemoManageTheme from '../demos/manage-theme'
import DemoManageUndo from '../demos/manage-undo'
import DemoProps from '../demos/props'
import DemoRules from '../demos/rules'
import DemoScope from '../demos/scope'
import DemoSearch from '../demos/search'
import DemoServerFold from '../demos/server-fold'
import DemoServerLiveTags from '../demos/server-live-tags'
import DemoServerMetaPreview from '../demos/server-meta-preview'
import DemoServerPaywall from '../demos/server-paywall'
import DemoServerReplay from '../demos/server-replay'
import DemoServerUploadCheck from '../demos/server-upload-check'
import DemoShared from '../demos/shared'
import DemoStackDeferred from '../demos/stack-deferred'
import DemoStackForm from '../demos/stack-form'
import DemoStackOptimistic from '../demos/stack-optimistic'
import DemoStackTags from '../demos/stack-tags'
import DemoStartComponents from '../demos/start-components'
import DemoStartConditional from '../demos/start-conditional'
import DemoStartCounter from '../demos/start-counter'
import DemoStartData from '../demos/start-data'
import DemoStartDerived from '../demos/start-derived'
import DemoStartEvents from '../demos/start-events'
import DemoStartList from '../demos/start-list'
import DemoStartShared from '../demos/start-shared'
import DemoStartStyles from '../demos/start-styles'
import DemoStartThinkingStep1 from '../demos/start-thinking-step-1'
import DemoStartThinkingStep2 from '../demos/start-thinking-step-2'
import DemoStartThinkingStep3 from '../demos/start-thinking-step-3'
import DemoStartTutorialStep1 from '../demos/start-tutorial-step-1'
import DemoStartTutorialStep2 from '../demos/start-tutorial-step-2'
import DemoStartTutorialStep3 from '../demos/start-tutorial-step-3'
import DemoStartTutorialStep4 from '../demos/start-tutorial-step-4'
import DemoStartTutorialStep5 from '../demos/start-tutorial-step-5'
import DemoStartTutorialStep6 from '../demos/start-tutorial-step-6'
import DemoStyleDialog from '../demos/style-dialog'
import DemoStyleDials from '../demos/style-dials'
import DemoStyleIcons from '../demos/style-icons'
import DemoStyleKeyboard from '../demos/style-keyboard'
import DemoStyleLabels from '../demos/style-labels'
import DemoStyleOrder from '../demos/style-order'
import DemoStyleScale from '../demos/style-scale'
import DemoStyleTable from '../demos/style-table'
import DemoStyled from '../demos/styled'
import DemoToolCoupon from '../demos/tool-coupon'
import DemoToolRows from '../demos/tool-rows'
import DemoUiKit from '../demos/ui-kit'
import DemoUiState from '../demos/ui-state'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '../styles/example.css'

function learnBasics(props: { id: string }) {
  return (
    <>
      {props.id === 'alias' && <DemoAlias />}
      {props.id === 'async' && <DemoAsync />}
      {props.id === 'bind' && <DemoBind />}
      {props.id === 'describe-braces' && <DemoDescribeBraces />}
      {props.id === 'describe-children' && <DemoDescribeChildren />}
      {props.id === 'describe-gallery' && <DemoDescribeGallery />}
      {props.id === 'describe-keys' && <DemoDescribeKeys />}
      {props.id === 'describe-markup' && <DemoDescribeMarkup />}
      {props.id === 'describe-mounted' && <DemoDescribeMounted />}
      {props.id === 'describe-packing' && <DemoDescribePacking />}
      {props.id === 'describe-people' && <DemoDescribePeople />}
      {props.id === 'describe-runs' && <DemoDescribeRuns />}
      {props.id === 'describe-tree' && <DemoDescribeTree />}
      {props.id === 'effects' && <DemoEffects />}
      {props.id === 'entries' && <DemoEntries />}
      {props.id === 'escape-browser' && <DemoEscapeBrowser />}
      {props.id === 'escape-debounce' && <DemoEscapeDebounce />}
      {props.id === 'escape-filter' && <DemoEscapeFilter />}
      {props.id === 'escape-focus' && <DemoEscapeFocus />}
      {props.id === 'escape-forward' && <DemoEscapeForward />}
      {props.id === 'escape-keyed' && <DemoEscapeKeyed />}
      {props.id === 'escape-measure' && <DemoEscapeMeasure />}
      {props.id === 'escape-owner' && <DemoEscapeOwner />}
      {props.id === 'escape-pointer' && <DemoEscapePointer />}
      {props.id === 'escape-refresh' && <DemoEscapeRefresh />}
      {props.id === 'escape-reserve' && <DemoEscapeReserve />}
      {props.id === 'escape-retry' && <DemoEscapeRetry />}
      {props.id === 'escape-room' && <DemoEscapeRoom />}
      {props.id === 'escape-root' && <DemoEscapeRoot />}
      {props.id === 'escape-scroll' && <DemoEscapeScroll />}
      {props.id === 'escape-shape' && <DemoEscapeShape />}
      {props.id === 'escape-stream' && <DemoEscapeStream />}
      {props.id === 'escape-surface' && <DemoEscapeSurface />}
      {props.id === 'events' && <DemoEvents />}
      {props.id === 'getting-started' && <DemoGettingStarted />}
      {props.id === 'hello' && <DemoHello />}
    </>
  )
}

function learnInteraction(props: { id: string }) {
  return (
    <>
      {props.id === 'interact-bind-input' && <DemoInteractBindInput />}
      {props.id === 'interact-controls' && <DemoInteractControls />}
      {props.id === 'interact-flush' && <DemoInteractFlush />}
      {props.id === 'interact-gallery' && <DemoInteractGallery />}
      {props.id === 'interact-instances' && <DemoInteractInstances />}
      {props.id === 'interact-nested' && <DemoInteractNested />}
      {props.id === 'interact-person' && <DemoInteractPerson />}
      {props.id === 'interact-propagation' && <DemoInteractPropagation />}
      {props.id === 'interact-runs' && <DemoInteractRuns />}
      {props.id === 'interact-submit' && <DemoInteractSubmit />}
      {props.id === 'interact-three' && <DemoInteractThree />}
      {props.id === 'interact-todos-step-1' && <DemoInteractTodosStep1 />}
      {props.id === 'interact-todos-step-2' && <DemoInteractTodosStep2 />}
      {props.id === 'interact-todos-step-3' && <DemoInteractTodosStep3 />}
      {props.id === 'interact-toolbar' && <DemoInteractToolbar />}
      {props.id === 'loading' && <DemoLoading />}
    </>
  )
}

function learnState(props: { id: string }) {
  return (
    <>
      {props.id === 'manage-accordion' && <DemoManageAccordion />}
      {props.id === 'manage-chain' && <DemoManageChain />}
      {props.id === 'manage-context' && <DemoManageContext />}
      {props.id === 'manage-interaction' && <DemoManageInteraction />}
      {props.id === 'manage-keep' && <DemoManageKeep />}
      {props.id === 'manage-quiz' && <DemoManageQuiz />}
      {props.id === 'manage-reset' && <DemoManageReset />}
      {props.id === 'manage-rows' && <DemoManageRows />}
      {props.id === 'manage-selected' && <DemoManageSelected />}
      {props.id === 'manage-states' && <DemoManageStates />}
      {props.id === 'manage-theme' && <DemoManageTheme />}
      {props.id === 'manage-undo' && <DemoManageUndo />}
      {props.id === 'props' && <DemoProps />}
      {props.id === 'rules' && <DemoRules />}
      {props.id === 'scope' && <DemoScope />}
      {props.id === 'search' && <DemoSearch />}
    </>
  )
}

function learnServer(props: { id: string }) {
  return (
    <>
      {props.id === 'server-fold' && <DemoServerFold />}
      {props.id === 'server-live-tags' && <DemoServerLiveTags />}
      {props.id === 'server-meta-preview' && <DemoServerMetaPreview />}
      {props.id === 'server-paywall' && <DemoServerPaywall />}
      {props.id === 'server-replay' && <DemoServerReplay />}
      {props.id === 'server-upload-check' && <DemoServerUploadCheck />}
      {props.id === 'shared' && <DemoShared />}
      {props.id === 'stack-deferred' && <DemoStackDeferred />}
      {props.id === 'stack-form' && <DemoStackForm />}
      {props.id === 'stack-optimistic' && <DemoStackOptimistic />}
      {props.id === 'stack-tags' && <DemoStackTags />}
    </>
  )
}

function learnStart(props: { id: string }) {
  return (
    <>
      {props.id === 'start-components' && <DemoStartComponents />}
      {props.id === 'start-conditional' && <DemoStartConditional />}
      {props.id === 'start-counter' && <DemoStartCounter />}
      {props.id === 'start-data' && <DemoStartData />}
      {props.id === 'start-derived' && <DemoStartDerived />}
      {props.id === 'start-events' && <DemoStartEvents />}
      {props.id === 'start-list' && <DemoStartList />}
      {props.id === 'start-shared' && <DemoStartShared />}
      {props.id === 'start-styles' && <DemoStartStyles />}
      {props.id === 'start-thinking-step-1' && <DemoStartThinkingStep1 />}
      {props.id === 'start-thinking-step-2' && <DemoStartThinkingStep2 />}
      {props.id === 'start-thinking-step-3' && <DemoStartThinkingStep3 />}
      {props.id === 'start-tutorial-step-1' && <DemoStartTutorialStep1 />}
      {props.id === 'start-tutorial-step-2' && <DemoStartTutorialStep2 />}
      {props.id === 'start-tutorial-step-3' && <DemoStartTutorialStep3 />}
      {props.id === 'start-tutorial-step-4' && <DemoStartTutorialStep4 />}
      {props.id === 'start-tutorial-step-5' && <DemoStartTutorialStep5 />}
      {props.id === 'start-tutorial-step-6' && <DemoStartTutorialStep6 />}
    </>
  )
}

function learnStyle(props: { id: string }) {
  return (
    <>
      {props.id === 'style-dialog' && <DemoStyleDialog />}
      {props.id === 'style-dials' && <DemoStyleDials />}
      {props.id === 'style-icons' && <DemoStyleIcons />}
      {props.id === 'style-keyboard' && <DemoStyleKeyboard />}
      {props.id === 'style-labels' && <DemoStyleLabels />}
      {props.id === 'style-order' && <DemoStyleOrder />}
      {props.id === 'style-scale' && <DemoStyleScale />}
      {props.id === 'style-table' && <DemoStyleTable />}
      {props.id === 'styled' && <DemoStyled />}
      {props.id === 'tool-coupon' && <DemoToolCoupon />}
      {props.id === 'tool-rows' && <DemoToolRows />}
      {props.id === 'ui-kit' && <DemoUiKit />}
      {props.id === 'ui-state' && <DemoUiState />}
    </>
  )
}

/**
 * A Learn page's live demo. One JSX site per demo, as in PageExample: each is then an island the server renders, and a
 * press before its code has loaded is held and replayed. scripts/content.mjs reads the ids here, so a page can only name
 * a demo that has a site.
 */
export function LearnDemo(props: { id: string }) {
  return (
    <div data-part="run">
      {learnBasics(props)}
      {learnInteraction(props)}
      {learnState(props)}
      {learnServer(props)}
      {learnStart(props)}
      {learnStyle(props)}
    </div>
  )
}
