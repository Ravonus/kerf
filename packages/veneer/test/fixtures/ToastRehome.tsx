import { Toaster } from '../../src/Toast'

/** A purchase's status and toaster share one live fragment before its dialog. */
export function ToastRehome(props: { open: boolean; quote: number }) {
  return (
    <div data-price-box="">
      {props.open ? (
        <>
          {props.quote > 0 && <p>Quote {props.quote}</p>}
          <Toaster />
        </>
      ) : null}
      <span data-after="">After</span>
    </div>
  )
}
