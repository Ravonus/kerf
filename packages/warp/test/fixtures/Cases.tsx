// One small app per warp component: the component plus a driver (a plain button, or the component's own control)
// for the one interaction its work budget and hydration round trip cover (test/budget.test.tsx, hydrate.test.tsx).
import { state } from 'weft'
// each from its own file: the ?weft-ssr / ?weft-hydrate query follows .tsx imports (not the index.ts barrel)
import { Alert } from '../../src/Alert'
import { Badge } from '../../src/Badge'
import { Button } from '../../src/Button'
import { Card } from '../../src/Card'
import { Checkbox, Segmented, Switch } from '../../src/Choice'
import { Chip } from '../../src/Chip'
import { Drawer } from '../../src/Drawer'
import { Input, Search, Textarea } from '../../src/Field'
import { Select } from '../../src/Select'
import { Kbd } from '../../src/Kbd'
import { Modal } from '../../src/Modal'
import { Popover } from '../../src/Popover'
import { Progress } from '../../src/Progress'
import { Skeleton } from '../../src/Skeleton'
import { Shape } from '../../src/Shape'
import { Spinner } from '../../src/Spinner'
import { Tabs } from '../../src/Tabs'
import { Tag } from '../../src/Tag'
import { Toaster, toast } from '../../src/Toast'
import { Toggle } from '../../src/Toggle'
import { Tooltip } from '../../src/Tooltip'

const Drive = ({ onClick }: { onClick: () => void }) => <button type="button" data-drive="" onClick={onClick}>drive</button>

export function ButtonCase() {
  const n = state(0)
  return <Button emphasis="outline" onClick={() => n.value++}>Added {n.value}</Button>
}
export function LoadingCase() {
  const busy = state(false)
  return <><Button loading={busy.value}>Save</Button><Drive onClick={() => (busy.value = !busy.value)} /></>
}
export function ToggleCase() {
  const on = state(false)
  return <Toggle pressed={on.value} onClick={() => (on.value = !on.value)}>Products</Toggle>
}
export function InputCase() {
  const v = state('')
  return <Input label="Email address" value={v.value} onInput={(e: any) => (v.value = e.currentTarget.value)} hint="We never share it." />
}
export function SearchCase() {
  const v = state('')
  return <Search label="Search" value={v.value} onInput={(e: any) => (v.value = e.currentTarget.value)} />
}
export function TextareaCase() {
  const v = state('')
  return <Textarea label="Note" counter={40} value={v.value} onInput={(e: any) => (v.value = e.currentTarget.value)} />
}
export function SelectCase() {
  const v = state('price')
  return <Select label="Sort" value={v.value} onChange={(e: any) => (v.value = e.currentTarget.value)} options={[{ value: 'price', label: 'Price' }, { value: 'name', label: 'Name' }]} />
}
export function CheckboxCase() {
  const on = state(false)
  return <Checkbox checked={on.value} onChange={(e: any) => (on.value = e.currentTarget.checked)}>Subscribe</Checkbox>
}
export function SwitchCase() {
  const on = state(false)
  return <Switch checked={on.value} onChange={(e: any) => (on.value = e.currentTarget.checked)}>Dark mode</Switch>
}
export function SegmentedCase() {
  const v = state<'list' | 'grid'>('list')
  return <Segmented label="View" value={v.value} onChange={x => (v.value = x)} options={[{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }]} />
}
export function TabsCase() {
  const v = state<'a' | 'b' | 'c'>('a')
  return (
    <Tabs label="Settings" value={v.value} onChange={x => (v.value = x)} options={[{ value: 'a', label: 'Account' }, { value: 'b', label: 'Billing' }, { value: 'c', label: 'Team' }]}>
      {x => <p>Panel {x}</p>}
    </Tabs>
  )
}
export function ChipCase() {
  const on = state(false)
  return <Chip pressed={on.value} count={12} onClick={() => (on.value = !on.value)}>Fruit</Chip>
}
export function CardCase() {
  const n = state(1)
  return <><Card eyebrow="Fruit" title={`Apple ×${n.value}`}>Crisp.</Card><Drive onClick={() => n.value++} /></>
}
export function BadgeCase() {
  const n = state(3)
  return <><Badge tone="accent" count>{n.value}</Badge><Drive onClick={() => n.value++} /></>
}
export function TagCase() {
  const tags = state(['fruit', 'dairy'])
  return <div>{tags.value.map(t => <Tag key={t} onRemove={() => (tags.value = tags.value.filter(x => x !== t))}>{t}</Tag>)}</div>
}
export function KbdCase() {
  const n = state(0)
  return <p><Kbd>⌘K</Kbd> opened {n.value}<Drive onClick={() => n.value++} /></p>
}
export function AlertCase() {
  const shown = state(true)
  return <div>{shown.value && <Alert tone="caution" title="Low stock" onDismiss={() => (shown.value = false)}>Three left.</Alert>}</div>
}
export function ProgressCase() {
  const v = state(20)
  return <><Progress label="Upload" value={v.value} /><Drive onClick={() => (v.value += 10)} /></>
}
export function SpinnerCase() {
  const n = state(0)
  return <p><Spinner label="Loading" /> {n.value}<Drive onClick={() => n.value++} /></p>
}
export function SkeletonCase() {
  const n = state(0)
  return <div><Skeleton lines={3} /> {n.value}<Drive onClick={() => n.value++} /></div>
}
export function ShapeCase() {
  const n = state(0)
  return <div><Shape kind="card" media="16/9" lines={2} /> {n.value}<Drive onClick={() => n.value++} /></div>
}
export function TooltipCase() {
  return <Tooltip content="Keyboard shortcuts" kbd="?"><Button emphasis="ghost" icon="info" label="Help" /></Tooltip>
}
export function PopoverCase() {
  return <Popover label="Filters" title="Filters" description="Narrow the list.">body</Popover>
}
export function ModalCase() {
  const open = state(false)
  return <><Button onClick={() => (open.value = true)}>Delete</Button><Modal open={open} title="Delete item?" description="This can't be undone." footer={<Button data-close="">Cancel</Button>}>Sure?</Modal></>
}
export function DrawerCase() {
  const open = state(false)
  return <><Button onClick={() => (open.value = true)}>Cart</Button><Drawer open={open} title="Cart" side="right">Empty.</Drawer></>
}
export function ToastCase() {
  return <><Toaster /><Drive onClick={() => toast.show({ title: 'Saved', tone: 'positive' })} /></>
}
