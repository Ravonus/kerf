/** @jsxImportSource @weft-js/core */
// Type tests for React prop names (`npx tsc --noEmit -p test/react-types.tsconfig.json`). The @ts-expect-error lines
// are the negative control: these checks can fail.

export const Html = () => (
  <form acceptCharset="utf-8" onChange={e => e.currentTarget.reset()}>
    <input tabIndex={1} readOnly maxLength={5} autoComplete="off" autoFocus spellCheck={false} defaultValue="a" onChange={e => e.currentTarget.value} onDoubleClick={e => e.clientX} onClickCapture={e => e.clientX} />
    <input type="checkbox" defaultChecked crossOrigin="anonymous" srcSet="a 2x" className="a" />
    <td colSpan={2} rowSpan={2} />
    <div contentEditable={false} dangerouslySetInnerHTML={{ __html: '<b></b>' }} style={{ fontSize: 12, zIndex: 1 }} aria-hidden data-x={false} onCompositionStart={e => e.data} onGotPointerCapture={e => e.pointerId} />
    <meta httpEquiv="refresh" />
    <label htmlFor="a" />
    <svg viewBox="0 0 1 1" tabIndex={0}><path strokeWidth={2} strokeLinecap="round" fillOpacity={0.5} clipPath="url(#a)" onClick={e => e.currentTarget.getTotalLength()} /><stop stopColor="red" /><text textAnchor="middle" /></svg>
  </form>
)

export const Wrong = () => (
  <div
    // @ts-expect-error the handler gets an event
    onChange={(e: number) => e}
    // @ts-expect-error `__html` is required
    dangerouslySetInnerHTML={{ html: 'a' }}
  />
)
