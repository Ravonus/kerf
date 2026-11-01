// The one interaction each component case is checked with (fixtures/Cases.tsx), what the user then sees, and its
// work budget: the DOM writes and reactive re-runs it may cost. Budgets are the measured counts; raising one needs a
// reason here. Loading 4 re-runs: Button's icon and loading wrapper are live (derived, W018), one more node each.
import { fireEvent } from '@testing-library/dom'
import * as C from './Cases'

type Case = { act: (root: HTMLElement) => unknown; see: (root: HTMLElement) => void; budget: number; runs: number }
const q = (root: HTMLElement, sel: string) => root.querySelector<HTMLElement>(sel)!
const drive = (root: HTMLElement) => q(root, '[data-drive]').click()
const type = (root: HTMLElement, text: string) => {
  const input = q(root, '[data-part="input"]') as HTMLInputElement
  input.value = text
  fireEvent.input(input)
}

export const cases: Record<keyof typeof C, Case> = {
  ButtonCase: { act: r => q(r, 'button').click(), see: r => expect(r.textContent).toBe('Added 1'), budget: 1, runs: 3 },
  LoadingCase: { act: drive, see: r => expect(q(r, '[data-scope="button"]').getAttribute('aria-busy')).toBe('true'), budget: 4, runs: 4 },
  ToggleCase: { act: r => q(r, 'button').click(), see: r => expect(q(r, 'button').getAttribute('aria-pressed')).toBe('true'), budget: 2, runs: 1 },
  InputCase: { act: r => type(r, 'a'), see: r => expect(q(r, '[data-part="control"]').hasAttribute('data-filled')).toBe(true), budget: 2, runs: 3 },
  SearchCase: { act: r => type(r, 'a'), see: r => expect(q(r, '[data-part="control"]').hasAttribute('data-filled')).toBe(true), budget: 2, runs: 3 },
  TextareaCase: { act: r => type(r, 'abc'), see: r => expect(q(r, '[data-part="counter"]').textContent).toBe('3/40'), budget: 3, runs: 3 },
  SelectCase: {
    act: r => { const s = q(r, 'select') as HTMLSelectElement; s.value = 'name'; fireEvent.change(s) },
    see: r => expect((q(r, 'select') as HTMLSelectElement).value).toBe('name'), budget: 0, runs: 2,
  },
  CheckboxCase: { act: r => q(r, 'input').click(), see: r => expect((q(r, 'input') as HTMLInputElement).checked).toBe(true), budget: 0, runs: 1 },
  SwitchCase: { act: r => q(r, 'input').click(), see: r => expect((q(r, 'input') as HTMLInputElement).checked).toBe(true), budget: 0, runs: 1 },
  SegmentedCase: { act: r => r.querySelectorAll<HTMLElement>('input')[1].click(), see: r => expect(r.querySelectorAll<HTMLInputElement>('input')[1].checked).toBe(true), budget: 2, runs: 3 },
  TabsCase: {
    act: r => fireEvent.keyDown(q(r, '[aria-selected="true"]'), { key: 'ArrowRight' }),
    see: r => { expect(q(r, '[aria-selected="true"]').textContent).toBe('Billing'); expect(q(r, '[role="tabpanel"]:not([hidden])').textContent).toBe('Panel b') }, budget: 8, runs: 7,
  },
  ChipCase: { act: r => q(r, 'button').click(), see: r => expect(q(r, 'button').getAttribute('aria-pressed')).toBe('true'), budget: 3, runs: 3 },
  CardCase: { act: drive, see: r => expect(q(r, '[data-part="title"]').textContent).toBe('Apple ×2'), budget: 1, runs: 2 },
  LayoutCase: { act: drive, see: r => expect(q(r, 'section[data-scope="stack"]').getAttribute('data-gap')).toBe('group'), budget: 1, runs: 2 },
  TypeCase: { act: drive, see: r => expect(q(r, 'h1').textContent).toBe('Page 2'), budget: 1, runs: 1 },
  BadgeCase: { act: drive, see: r => expect(q(r, '[data-scope="badge"]').textContent).toBe('4'), budget: 1, runs: 1 },
  TagCase: { act: r => q(r, '[data-part="remove"]').click(), see: r => expect(r.querySelectorAll('[data-scope="tag"]')).toHaveLength(1), budget: 1, runs: 2 },
  KbdCase: { act: drive, see: r => expect(r.textContent).toContain('opened 1'), budget: 1, runs: 1 },
  AlertCase: { act: r => q(r, '[data-part="close"]').click(), see: r => expect(r.querySelector('[data-scope="alert"]')).toBeNull(), budget: 1, runs: 2 },
  ProgressCase: { act: drive, see: r => expect(q(r, '[role="progressbar"]').getAttribute('aria-valuenow')).toBe('30'), budget: 3, runs: 2 },
  SpinnerCase: { act: drive, see: r => expect(r.textContent).toContain('1'), budget: 1, runs: 1 },
  SkeletonCase: { act: drive, see: r => expect(r.textContent).toContain('1'), budget: 1, runs: 1 },
  ShapeCase: { act: drive, see: r => expect(r.textContent).toContain('1'), budget: 1, runs: 1 },
  TooltipCase: {
    act: r => { q(r, 'button').dispatchEvent(new FocusEvent('focusin', { bubbles: true })); q(r, 'button').focus() },
    see: r => expect(q(r, 'button').getAttribute('aria-describedby')).toBe(q(r, '[role="tooltip"]').id), budget: 0, runs: 0,
  },
  PopoverCase: { act: r => q(r, 'button').click(), see: r => expect(q(r, 'button').getAttribute('aria-expanded')).toBe('true'), budget: 7, runs: 2 },
  ModalCase: { act: r => q(r, 'button').click(), see: r => expect((q(r, 'dialog') as HTMLDialogElement).open).toBe(true), budget: 2, runs: 1 },
  DrawerCase: { act: r => q(r, 'button').click(), see: r => expect((q(r, 'dialog') as HTMLDialogElement).open).toBe(true), budget: 3, runs: 1 },
  TableSortCase: {
    act: r => q(r, '[data-part="sort"]').click(),
    see: r => { expect(q(r, 'th[data-col="name"]').getAttribute('aria-sort')).toBe('ascending'); expect(r.querySelector('tbody tr td[data-col="name"]')!.textContent).toBe('Apollo') }, budget: 3, runs: 12,
  },
  TableSelectCase: {
    act: r => r.querySelectorAll<HTMLElement>('tbody input')[1].click(),
    see: r => { expect(r.querySelectorAll('tr[data-selected]')).toHaveLength(1); expect((q(r, 'thead input') as HTMLInputElement).indeterminate).toBe(true); expect(q(r, '[data-part="bulk"] b').textContent).toBe('1 selected') }, budget: 3, runs: 7,
  },
  TableFilterCase: {
    act: r => type(r, 'bor'),
    see: r => { expect(r.querySelectorAll('tbody tr')).toHaveLength(1); expect(q(r, '[data-part="count"]').textContent).toBe('1 of 3') }, budget: 6, runs: 13,
  },
  TableLiveCase: {
    act: drive,
    see: r => { expect(q(r, 'td[data-col="budget"]').textContent).toBe('301'); expect(q(r, 'td[data-col="budget"]').dataset.delta).toBe('up') }, budget: 2, runs: 13,
  },
  ShellCase: {
    act: r => q(r, '[aria-haspopup="menu"]').click(),
    see: r => { expect(q(r, '[data-part="menu"]').hidden).toBe(false); expect(document.activeElement!.textContent).toBe('Profile') }, budget: 3, runs: 4,
  },
  ToastCase: { act: drive, see: r => expect(q(r, '[data-part="root"] [data-part="title"]').textContent).toBe('Saved'), budget: 6, runs: 5 },
  PagesCase: { act: r => [...r.querySelectorAll('button')].find(b => b.textContent === '4')!.click(), see: r => expect(q(r, '[aria-current="page"]').textContent).toBe('4'), budget: 7, runs: 15 },
  PaletteCase: { act: r => q(r, 'button').click(), see: () => expect(document.querySelector('[role="combobox"]')).toBeTruthy(), budget: 9, runs: 24 },
  CodeCase: { act: r => { const a = q(r, 'textarea') as HTMLTextAreaElement; a.value = 'x'; fireEvent.input(a) }, see: r => expect(q(r, '[data-out]').textContent).toBe('x'), budget: 3, runs: 8 },
  GridCase: { act: r => fireEvent.keyDown(q(r, 'tbody [tabindex="0"]'), { key: 'ArrowRight' }), see: r => expect(r.querySelectorAll('tbody [tabindex="0"]')).toHaveLength(1), budget: 2, runs: 0 },
  MarkdownEditorCase: { act: r => { const a = q(r, 'textarea') as HTMLTextAreaElement; a.value = '# x'; fireEvent.input(a) }, see: r => expect(q(r, '[data-scope="markdown"]').textContent).toBe('x'), budget: 2, runs: 6 },
}
