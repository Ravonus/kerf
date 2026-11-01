// React event names and mount behaviour on native elements, written directly and through a spread.
import { state } from 'weft'

type P = { log: (what: string) => void }

export const Direct = ({ log }: P) => (
  <div>
    <input data-t="text" onChange={e => log(`change:${e.currentTarget.value}`)} onInput={() => log('input')} />
    <input data-t="box" type="checkbox" onChange={e => log(`change:${e.currentTarget.checked}`)} />
    <select data-t="pick" onChange={e => log(`change:${e.currentTarget.value}`)}><option value="a">a</option><option value="b">b</option></select>
    <form data-t="form" onChange={() => log('form')}><input data-t="inner" /></form>
    <button data-t="dbl" onDoubleClick={() => log('double')}>d</button>
    <div data-t="outer" onClickCapture={() => log('capture')} onClick={() => log('bubble')}><button data-t="in" onClick={() => log('target')}>c</button></div>
  </div>
)

const s = <T,>(x: T): T => x

export const Spread = ({ log }: P) => (
  <div>
    <input {...s({ 'data-t': 'text', onChange: (e: any) => log(`change:${e.currentTarget.value}`), onInput: () => log('input') })} />
    <input {...s({ 'data-t': 'box', type: 'checkbox', onChange: (e: any) => log(`change:${e.currentTarget.checked}`) })} />
    <select {...s({ 'data-t': 'pick', onChange: (e: any) => log(`change:${e.currentTarget.value}`) })}><option value="a">a</option><option value="b">b</option></select>
    <form {...s({ 'data-t': 'form', onChange: () => log('form') })}><input data-t="inner" /></form>
    <button {...s({ 'data-t': 'dbl', onDoubleClick: () => log('double') })}>d</button>
    <div {...s({ 'data-t': 'outer', onClickCapture: () => log('capture'), onClick: () => log('bubble') })}><button data-t="in" onClick={() => log('target')}>c</button></div>
  </div>
)

/** A handler that changes: the old one must stop firing. */
export const Swapped = ({ log }: P) => {
  const n = state(1)
  return (
    <div>
      <input {...{ onChange: () => log(`v${n.value}`) } as any} data-n={n.value} />
      <button onClick={() => n.value++}>next</button>
    </div>
  )
}

export const Focused = ({ show, spread }: { show: () => boolean; spread?: boolean }) => (
  <div>{show() && (spread ? <input {...s({ autoFocus: true })} /> : <input autoFocus />)}</div>
)

/** `defaultValue` follows until the field is edited; `value` always does. */
export const Defaults = () => {
  const v = state('a')
  return (
    <div>
      <input data-t="dflt" defaultValue={v.value} />
      <textarea data-t="area" defaultValue={v.value}></textarea>
      <input data-t="spread" {...{ defaultValue: v.value } as any} />
      <button onClick={() => (v.value = 'b')}>next</button>
    </div>
  )
}

/** The negative control: what React habits must not change. */
export const Control = ({ log }: P) => (
  <div>
    <svg viewBox="0 0 1 1" fooBar="1"><clipPath clipPathUnits="userSpaceOnUse" /></svg>
    <div {...s({ fooBar: '1', 'z-index': '1' })} tabIndex={undefined} data-gone={undefined} aria-label={undefined} />
    <p style={{ width: '1px', 'z-index': 3, '--n': 2 } as any}>s</p>
    <button data-t="plain" onClick={() => log('click')}>b</button>
  </div>
)

export const InClosedDialog = () => <dialog><button autoFocus>Close</button></dialog>
