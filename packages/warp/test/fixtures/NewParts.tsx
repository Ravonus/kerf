// The redesign's new components, compiled, so props stay live.
import { state } from '@weft-js/core'
import { Accordion, type AccordionProps } from '../../src/Accordion'
import { RadioGroup } from '../../src/Choice'
import { Menu } from '../../src/Menu'
import { Select } from '../../src/Select'
import { Slider } from '../../src/Slider'
import { Ticker } from '../../src/Ticker'
import { Toaster, toast } from '../../src/Toast'

export { toast }
export const volume = state(40)
export const plan = state<'free' | 'pro'>('free')
export const count = state(1234)
export const Acc = (p: AccordionProps) => <Accordion {...p} />
export const Volume = () => <Slider label="Volume" value={volume.value} onChange={n => (volume.value = n)} format={n => `${n}%`} />
export const Price = () => <Slider label="Price" value={[10, 80]} onChange={() => {}} names={['Minimum', 'Maximum']} />
export const Off = () => <Slider label="Off" value={5} onChange={() => {}} disabled />
export const Plan = () => <RadioGroup label="Plan" value={plan.value} onChange={n => (plan.value = n)} options={[{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }]} />
export const Count = () => <Ticker value={count.value} format={{ useGrouping: true }} locale="en-US" />
export const Actions = () => <Menu label="Actions" items={[{ group: 'Project' }, { label: 'Rename', shortcut: '⌘R' }, { separator: true }, { label: 'Delete', tone: 'critical' }, { label: 'Gone', disabled: true }]} />
export const Sort = () => <Select label="Sort" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} />
export const Toasts = () => <Toaster />
