// The page overlays.browser.test.mjs drives: overlays near the viewport's edges, and inside a Modal.
import { render } from 'weft/dom'
import { state } from 'weft'
import { Button, DateField, Drawer, Menu, Modal, Slider } from '../../src/index'
import { ComboField } from '../../src/Combobox'

const fruits = ['Apple', 'Apricot', 'Avocado']
const rows = (n: number, name = 'Item') => Array.from({ length: n }, (_, i) => ({ label: `${name} ${i}` }))
const long = [{ label: 'A long enough menu item' }]

function App() {
  const modal = state(false), drawer = state(false), text = state(''), v = state(50), submitted = state(0)
  ;(window as any).api = { modal, drawer, text, submitted }
  return (
    <div style="min-block-size:3000px;padding:20px">
      <Button onClick={() => (modal.value = true)}>Open modal</Button>
      <Button onClick={() => (drawer.value = true)}>Open drawer</Button>
      <Modal open={modal} title="One">
        <ComboField label="Fruit" text={() => text.value} onText={t => (text.value = t)} minChars={1} find={async q => fruits.filter(f => f.toLowerCase().startsWith(q.toLowerCase()))} row={(f: string) => ({ main: f })} onPick={(f: string) => (text.value = f)} />
      </Modal>
      <Drawer open={drawer} title="Sheet" side="bottom"><p>hi</p></Drawer>
      <form id="form" style="margin-block-start:120px;inline-size:300px" onSubmit={(e: Event) => { e.preventDefault(); submitted.value++ }}>
        <DateField label="When" name="when" required locale="en-US" today="2026-01-15" presentation="popover" />
        <button id="send">Send</button>
      </form>
      <div style="block-size:400px"></div>
      <div id="rtl" dir="rtl" style="inline-size:300px"><Slider label="RTL" value={v.value} onChange={x => (v.value = x)} /></div>
      <div id="scrolled" style="margin-block-start:100px"><Menu label="ScrollMenu" items={long} /></div>
      <div id="low" style="position:fixed;inset-block-end:4px;inset-inline-start:300px"><Menu label="LowMenu" items={rows(6)} /></div>
      <div id="edge" style="position:fixed;inset-block-start:60px;inset-inline-end:4px"><Menu label="EdgeMenu" items={long} /></div>
      <div id="end" style="position:fixed;inset-block-start:60px;inset-inline-start:560px"><Menu label="EndMenu" align="end" items={long} /></div>
      <div id="center" style="position:fixed;inset-block-start:60px;inset-inline-start:760px"><Menu label="CenterMenu" align="center" items={long} /></div>
      <div id="tall" style="position:fixed;inset-block-start:4px;inset-inline-start:400px"><Menu label="TallMenu" items={rows(60, 'Row')} /></div>
      <div id="link" style="position:fixed;inset-block-start:4px;inset-inline-start:200px"><Menu label="LinkMenu" items={[{ label: 'Go there', href: '#there' }]} /></div>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
