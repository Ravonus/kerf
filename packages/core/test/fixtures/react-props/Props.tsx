// React-style prop names on native elements, written three ways: literal, dynamic and through a spread. The test
// renders each in client, SSR and hydration. Every lowering must produce the same DOM.

const style = {
  fontSize: 12,
  zIndex: 2,
  lineHeight: 1.5,
  marginTop: 0,
  backgroundColor: 'red',
  WebkitLineClamp: 2,
  '--gap': 4,
  msTransform: 'none',
  color: false,
  padding: '1px',
}

const a = {
  tabIndex: 3,
  on: true,
  off: false,
  maxLength: 5,
  autoComplete: 'off',
  text: 'hi',
  two: 2,
  three: 3,
  anon: 'anonymous',
  srcs: 'a.png 2x',
  utf: 'utf-8',
  refresh: 'refresh',
  pick: 'b',
  raw: { __html: '<b>raw</b>' },
  style,
}
/** Keeps a value out of the compiler's sight, so the attribute takes the dynamic path. */
const s = <T,>(x: T): T => x

export const Dynamic = () => (
  <div>
    <input
      tabIndex={s(a.tabIndex)}
      readOnly={s(a.on)}
      maxLength={s(a.maxLength)}
      autoComplete={s(a.autoComplete)}
      spellCheck={s(a.off)}
      defaultValue={s(a.text)}
      data-kind="text"
    />
    <input type="checkbox" defaultChecked={s(a.on)} data-kind="check" />
    <table>
      <tbody>
        <tr>
          <td colSpan={s(a.two)} rowSpan={s(a.three)}>
            x
          </td>
        </tr>
      </tbody>
    </table>
    <div contentEditable={s(a.off)} data-kind="edit">
      e
    </div>
    <img crossOrigin={s(a.anon)} srcSet={s(a.srcs)} alt="" />
    <form acceptCharset={s(a.utf)}></form>
    <meta httpEquiv={s(a.refresh)} />
    <textarea defaultValue={s(a.text)} data-kind="dflt"></textarea>
    <textarea value={s(a.text)} data-kind="ctl"></textarea>
    <select defaultValue={s(a.pick)}>
      <option value="a">a</option>
      <option value="b">b</option>
    </select>
    <select value={s(a.pick)} data-kind="ctl">
      <option value="a">a</option>
      <option value="b">b</option>
    </select>
    <div dangerouslySetInnerHTML={s(a.raw)} data-kind="raw"></div>
    <p style={s(a.style)}>s</p>
    <button
      aria-pressed={s(a.off)}
      aria-label={s(a.text)}
      data-active={s(a.off)}
      data-on={s(a.on)}
      data-n={s(a.two)}
    >
      b
    </button>
  </div>
)

export const Literal = () => (
  <div>
    <input
      tabIndex={3}
      readOnly
      maxLength={5}
      autoComplete="off"
      spellCheck={false}
      defaultValue="hi"
      data-kind="text"
    />
    <input type="checkbox" defaultChecked data-kind="check" />
    <table>
      <tbody>
        <tr>
          <td colSpan={2} rowSpan={3}>
            x
          </td>
        </tr>
      </tbody>
    </table>
    <div contentEditable={false} data-kind="edit">
      e
    </div>
    <img crossOrigin="anonymous" srcSet="a.png 2x" alt="" />
    <form acceptCharset="utf-8"></form>
    <meta httpEquiv="refresh" />
    <textarea defaultValue="hi" data-kind="dflt"></textarea>
    <textarea value="hi" data-kind="ctl"></textarea>
    <select defaultValue="b">
      <option value="a">a</option>
      <option value="b">b</option>
    </select>
    <select value="b" data-kind="ctl">
      <option value="a">a</option>
      <option value="b">b</option>
    </select>
    <div dangerouslySetInnerHTML={{ __html: '<b>raw</b>' }} data-kind="raw"></div>
    <p
      style={{
        fontSize: 12,
        zIndex: 2,
        lineHeight: 1.5,
        marginTop: 0,
        backgroundColor: 'red',
        WebkitLineClamp: 2,
        '--gap': 4,
        msTransform: 'none',
        color: false,
        padding: '1px',
      }}
    >
      s
    </p>
    <button aria-pressed={false} aria-label="hi" data-active={false} data-on={true} data-n={2}>
      b
    </button>
  </div>
)

export const Spread = () => (
  <div>
    <input
      {...s({
        tabIndex: 3,
        readOnly: true,
        maxLength: 5,
        autoComplete: 'off',
        spellCheck: false,
        defaultValue: 'hi',
        'data-kind': 'text',
      })}
    />
    <input {...s({ type: 'checkbox', defaultChecked: true, 'data-kind': 'check' })} />
    <table>
      <tbody>
        <tr>
          <td {...s({ colSpan: 2, rowSpan: 3 })}>x</td>
        </tr>
      </tbody>
    </table>
    <div {...s({ contentEditable: false, 'data-kind': 'edit' })}>e</div>
    <img {...s({ crossOrigin: 'anonymous', srcSet: 'a.png 2x', alt: '' })} />
    <form {...s({ acceptCharset: 'utf-8' })}></form>
    <meta {...s({ httpEquiv: 'refresh' })} />
    <textarea {...s({ defaultValue: 'hi', 'data-kind': 'dflt' })}></textarea>
    <textarea {...s({ value: 'hi', 'data-kind': 'ctl' })}></textarea>
    <select {...s({ defaultValue: 'b' })}>
      <option value="a">a</option>
      <option value="b">b</option>
    </select>
    <select {...s({ value: 'b', 'data-kind': 'ctl' })}>
      <option value="a">a</option>
      <option value="b">b</option>
    </select>
    <div {...s({ dangerouslySetInnerHTML: { __html: '<b>raw</b>' }, 'data-kind': 'raw' })}></div>
    <p {...s({ style })}>s</p>
    <button
      {...s({
        'aria-pressed': false,
        'aria-label': 'hi',
        'data-active': false,
        'data-on': true,
        'data-n': 2,
      })}
    >
      b
    </button>
  </div>
)

const g = {
  width: 2,
  cap: 'round',
  op: 0.5,
  clip: 'url(#c)',
  stop: 'red',
  anchor: 'middle',
  box: '0 0 10 10',
  idx: 0,
  href: '#a',
  no: false,
  units: 'userSpaceOnUse',
}

export const SvgDynamic = () => (
  <svg viewBox={s(g.box)} tabIndex={s(g.idx)} focusable={s(g.no)}>
    <path
      strokeWidth={s(g.width)}
      strokeLinecap={s(g.cap)}
      fillOpacity={s(g.op)}
      clipPath={s(g.clip)}
    />
    <stop stopColor={s(g.stop)} />
    <text textAnchor={s(g.anchor)}>t</text>
    <use xlinkHref={s(g.href)} />
    <linearGradient gradientUnits={s(g.units)} />
  </svg>
)

export const SvgLiteral = () => (
  <svg viewBox="0 0 10 10" tabIndex={0} focusable={false}>
    <path strokeWidth={2} strokeLinecap="round" fillOpacity={0.5} clipPath="url(#c)" />
    <stop stopColor="red" />
    <text textAnchor="middle">t</text>
    <use xlinkHref="#a" />
    <linearGradient gradientUnits="userSpaceOnUse" />
  </svg>
)

export const SvgSpread = () => (
  <svg {...s({ viewBox: '0 0 10 10', tabIndex: 0, focusable: false })}>
    <path
      {...s({ strokeWidth: 2, strokeLinecap: 'round', fillOpacity: 0.5, clipPath: 'url(#c)' })}
    />
    <stop {...s({ stopColor: 'red' })} />
    <text {...s({ textAnchor: 'middle' })}>t</text>
    <use {...s({ xlinkHref: '#a' })} />
    <linearGradient {...s({ gradientUnits: 'userSpaceOnUse' })} />
  </svg>
)
