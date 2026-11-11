import { BagIcon, DownIcon } from '@kerf/veneer-icons'
import { Button } from '../Button'
import { Input } from '../Field'
import { Tag } from '../Tag'
import type { CheckoutModel } from './Checkout-view'

export function checkoutSummary(model: CheckoutModel) {
  const { code, codeError, applied, checking, lines, total, cost, refs } = model.s
  const { input } = model
  const { apply, unapply } = model.coupon
  return (
    <details ref={(n) => (refs.summary = n)} data-part="summary">
      <summary>
        <span class="row">
          <BagIcon />
          Order summary
        </span>
        <span class="row">
          <b>{cost(total.value)}</b>
          <DownIcon />
        </span>
      </summary>
      {lines.value.map((l) => (
        <div key={l.id} data-scope="line-item">
          <span data-part="thumb">{l.art && <img src={l.art} alt="" />}</span>
          <span>
            <b>{l.name}</b>
            <small>Qty {l.quantity}</small>
          </span>
          <span data-part="price">{cost(l.price * l.quantity)}</span>
        </div>
      ))}
      {input.coupon() && (
        <form
          data-scope="row"
          data-wrap="none"
          data-align="start"
          novalidate
          onSubmit={(e: Event) => void apply(e)}
        >
          <div data-grow="">
            <Input
              label="Discount code"
              value={code.value}
              error={codeError.value}
              onInput={(e) => {
                code.value = e.currentTarget.value
                codeError.value = ''
              }}
            />
          </div>
          <Button emphasis="frame" type="submit" loading={checking.value}>
            Apply
          </Button>
        </form>
      )}
      {applied.value && (
        <div class="chips">
          <Tag label={applied.value.code} onRemove={unapply}>
            {applied.value.code}
          </Tag>
        </div>
      )}
      {checkoutTotals(model)}
    </details>
  )
}

function checkoutTotals(model: CheckoutModel) {
  const { applied, newTotal, option, totals, total, cost } = model.s
  return (
    <dl data-scope="lines">
      <div>
        <dt>Subtotal</dt>
        <dd>{cost(totals.value.subtotal)}</dd>
      </div>
      {applied.value && (
        <div>
          <dt>Discount · {applied.value.code}</dt>
          <dd>−{cost(totals.value.discount)}</dd>
        </div>
      )}
      <div>
        <dt>Shipping · {option.value?.name}</dt>
        <dd>{totals.value.shipping ? cost(totals.value.shipping) : 'Free'}</dd>
      </div>
      <div>
        <dt>Estimated tax</dt>
        <dd>{cost(totals.value.tax)}</dd>
      </div>
      <div data-part="total">
        <dt>Total</dt>
        <dd data-changed={newTotal.value !== undefined ? '' : undefined}>{cost(total.value)}</dd>
      </div>
    </dl>
  )
}
