import { render } from '@weft-js/core/dom'
import { Sparkline } from '../../src/Charts'
import { RichTextEditor } from '../../src/RichTextEditor'
import { Select } from '../../src/Select'
import { Table } from '../../src/Table'

const rows = [{ id: 'a', name: 'Alpha', cost: 1 }, { id: 'b', name: 'Beta', cost: 2 }]
const columns = [{ id: 'name', header: 'Name', sort: true }, { id: 'cost', header: 'Cost', sort: true, numeric: true }]
// a box is a container, as the shell or a pane is in an app: a table's breakpoints follow the nearest one
const box = (id: string, w: number, ui: unknown) => <div id={id} style={`inline-size:${w}px;container-type:inline-size`}>{ui}</div>

render(() => (
  <>
    {box('desktop', 598, <Table caption="Desktop column" rows={rows} columns={columns} picker={false} />)}
    {box('narrow', 342, <Table caption="Narrow column" rows={rows} columns={columns} picker={false} />)}
    {box('pick', 240, <Select label="Plan" value="a" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />)}
    {box('edit', 400, <RichTextEditor label="Notes" value="" />)}
    {box('spark', 208, <Sparkline values={[10, 30, 20, 40]} />)}
  </>
), document.getElementById('app')!)
