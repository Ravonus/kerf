import { render } from 'weft/dom'
import { state } from 'weft'
import { Button } from '../../src/Button'
import { PaginationBar } from '../../src/Pagination'
import { Table } from '../../src/Table'
import { Toggle } from '../../src/Toggle'

const rows = [{ id: 'a', name: 'Alpha', cost: 1 }, { id: 'b', name: 'Beta', cost: 2 }]
const columns = [{ id: 'name', header: 'Name', sort: true }, { id: 'cost', header: 'Cost', sort: true, numeric: true }]
const WIDE = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, header: `Column ${i}` }))
const wideRows = [0, 1].map(r => ({ id: `r${r}`, ...Object.fromEntries(WIDE.map(c => [c.id, `value ${r}-${c.id}`])) }))
const box = (id: string, w: number, ui: any) => <div id={id} style={`inline-size:${w}px`}>{ui}</div>

function Toggles() {
  const on = [state(true), state(true), state(true)]
  return (
    <div id="toggles" style="display:flex;gap:16px;align-items:center;padding:8px">
      <Toggle size="sm" pressed={on[0].value} onClick={() => (on[0].value = !on[0].value)}>Bold</Toggle>
      <Toggle pressed={on[1].value} onClick={() => (on[1].value = !on[1].value)}>Bold</Toggle>
      <Toggle size="lg" pressed={on[2].value} onClick={() => (on[2].value = !on[2].value)}>Bold</Toggle>
    </div>
  )
}

render(() => (
  <>
    <Toggles />
    {box('sortbar', 342, <Table caption="Narrow" rows={rows} columns={columns} picker={false} sort={state({ id: 'cost', dir: 'ascending' as const })} />)}
    {box('pager', 360, <PaginationBar total={200} size={25} />)}
    {box('wide', 420, <Table caption="Wide" rows={wideRows} columns={WIDE} picker={false} phone="columns" />)}
    <div id="solid" data-expression="vivid" style="padding:16px"><Button>Deploy now</Button></div>
    <div id="solid-balanced" data-expression="balanced" style="padding:16px"><Button>Deploy now</Button></div>
  </>
), document.getElementById('app')!)
