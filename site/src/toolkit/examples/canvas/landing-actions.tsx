import type { State } from '@kerf-js/core'
import { state, untrack } from '@kerf-js/core'
import {
  Stack,
  Row,
  Grid,
  StageSelect,
} from '@kerf-js/veneer'
import {
  LAND_SECTION,
  H2,
  LAND_PLANS,
  LAND_FAQ,
  DISPLAY,
} from './landing-content'
import { LookStage } from './stage-landing'
import type { Look } from './stage-landing'
import {
  landingHeader,
  landingHero,
  landingFeatures,
  landingControls,
} from './landing-sections'

function billingPeriod(yearly: State<boolean>) {
  return (
    <Row
      gap="tight"
      role="group"
      aria-label="Billing period"
    >
      <button
        data-skin="chip"
        aria-pressed={yearly.value ? 'false' : 'true'}
        onClick={() => (yearly.value = false)}
      >
        Monthly
      </button>
      <button
        data-skin="chip"
        aria-pressed={yearly.value ? 'true' : 'false'}
        onClick={() => (yearly.value = true)}
      >
        Yearly, two months free
      </button>
    </Row>
  )
}

export function landingPricing(
  yearly: State<boolean>,
  plan: State<string>,
  price: (monthly: number) => number,
) {
  return (
    <section
      data-land="pricing"
      style={LAND_SECTION}
    >
      <Stack gap="group">
        <Row
          justify="between"
          gap="related"
          wrap
        >
          <h2
            data-skin="type"
            style={H2}
          >
            Pricing
          </h2>
          {billingPeriod(yearly)}
        </Row>
        <Grid
          min="md"
          cols={3}
          gap="group"
        >
          {LAND_PLANS.map((p) => (
            <button
              key={p.name}
              data-skin="card"
              data-ramp={
                p.name === 'Team' ? 'accent' : undefined
              }
              aria-pressed={
                plan.value === p.name ? 'true' : 'false'
              }
              onClick={() => (plan.value = p.name)}
            >
              <span
                style={'font-weight:700;font-size:18px'}
              >
                {p.name}
              </span>
              <span
                style={
                  'font-family:' +
                  'var(--veneer-font-display);' +
                  'font-size:44px;font-weight:800;' +
                  'line-height:1'
                }
              >
                ${price(p.monthly)}
                <span
                  style={'font-size:15px;font-weight:500'}
                >
                  {yearly.value ? ' a year' : ' a month'}
                </span>
              </span>
              <span style="line-height:1.5">
                {p.blurb}
              </span>
            </button>
          ))}
        </Grid>
      </Stack>
    </section>
  )
}

export function landingFaq() {
  return (
    <section
      data-land="faq"
      style={LAND_SECTION}
    >
      <Stack gap="group">
        <h2
          data-skin="type"
          style={H2}
        >
          Questions
        </h2>
        {LAND_FAQ.map((f) => (
          <details
            key={f.q}
            data-skin="card"
          >
            <summary>{f.q}</summary>
            <p style="line-height:1.55">{f.a}</p>
          </details>
        ))}
      </Stack>
    </section>
  )
}

export function landingFooter(joined: State<boolean>) {
  const submit = (e: Event) => {
    e.preventDefault()
    joined.value = true
  }
  return (
    <footer
      style={`${LAND_SECTION};display:grid;gap:24px`}
    >
      <form
        data-skin="card"
        onSubmit={submit}
      >
        <h2
          data-skin="type"
          data-ramp="accent"
          style={
            DISPLAY + ';font-size:clamp(26px,4cqi,40px)'
          }
        >
          {joined.value
            ? 'You are on the list.'
            : 'Get the changelog'}
        </h2>
        <Row
          gap="related"
          wrap
        >
          <input
            type="email"
            required
            placeholder="you@company.com"
            aria-label="Email"
            data-skin="field"
            style="inline-size:auto;flex:1 1 220px"
          />
          <button data-skin="button">Subscribe</button>
        </Row>
      </form>
      <div data-skin="rule"></div>
      <Row
        justify="between"
        wrap
        gap="related"
      >
        <span data-skin="clear">© 2026 kerf</span>
        <span data-skin="clear">
          Painted on one canvas.
        </span>
      </Row>
    </footer>
  )
}

type DialogProps = {
  name: Look
  plan: State<string>
  signedUp: State<boolean>
  setDialog: (n: HTMLDialogElement) => HTMLDialogElement
  close: () => void
}

export function landingDialog(o: DialogProps) {
  const submit = (e: Event) => {
    e.preventDefault()
    o.signedUp.value = true
  }
  return (
    <dialog
      ref={o.setDialog}
      aria-label="Start a project"
      onClose={() => (o.signedUp.value = false)}
    >
      <LookStage
        look={o.name}
        role="modal"
        onClick={(e: MouseEvent) =>
          e.target === e.currentTarget && o.close()
        }
      >
        <form
          data-skin="panel"
          onSubmit={submit}
        >
          <div data-skin="bar">
            <span>Start a project</span>
          </div>
          <Stack gap="related">
            {o.signedUp.value ? (
              <p style="margin:0;line-height:1.5">
                Done. Your first preview builds as soon as
                you push.
              </p>
            ) : (
              signupFields(o.plan)
            )}
            <Row
              gap="related"
              justify="end"
            >
              <button
                type="button"
                data-skin="button"
                data-look="outline"
                onClick={() => o.close()}
              >
                {o.signedUp.value ? 'Close' : 'Cancel'}
              </button>
              {!o.signedUp.value && (
                <button data-skin="button">Create</button>
              )}
            </Row>
          </Stack>
        </form>
      </LookStage>
    </dialog>
  )
}

function signupFields(plan: State<string>) {
  return (
    <>
      <label data-part="label">
        Email
        <input
          type="email"
          required
          autofocus
          placeholder="you@company.com"
          data-skin="field"
        />
      </label>
      <label data-part="label">
        Plan
        <StageSelect
          name="plan"
          options={LAND_PLANS.map((p) => p.name)}
          value={plan.value}
          onChange={(v: string) => (plan.value = v)}
        />
      </label>
      <label data-part="option">
        <input
          type="checkbox"
          data-skin="check"
          checked
        />
        Send me the changelog
      </label>
    </>
  )
}

export function Landing({ look }: { look: Look }) {
  const yearly = state(false)
  const plan = state('Team')
  const minutes = state(1800)
  const joined = state(false)
  const signedUp = state(false)
  const name = untrack(() => look)
  let dialog: HTMLDialogElement | undefined
  const price = (monthly: number) =>
    yearly.value ? Math.round(monthly * 10) : monthly
  const open = () => dialog?.showModal()
  const close = () => dialog?.close()
  const setDialog = (n: HTMLDialogElement) => (dialog = n)
  return (
    <LookStage
      look={name}
      role="page"
      aria-label={[
        'kerf, a landing page painted ',
        'on one canvas',
      ].join('')}
    >
      {landingHeader(name, open)}

      {landingHero(open)}

      {landingFeatures()}

      {landingControls(name, open, minutes)}

      {landingPricing(yearly, plan, price)}

      {landingFaq()}

      {landingFooter(joined)}

      {landingDialog({
        name,
        plan,
        signedUp,
        setDialog,
        close,
      })}
    </LookStage>
  )
}
