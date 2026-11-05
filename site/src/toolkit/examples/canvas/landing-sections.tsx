import { Row, Split, Stack, Grid, StageSelect } from '@weft-js/warp'
import type { State } from '@weft-js/core'
import type { Look } from './stage-landing'
import {
  LookStage,
  LAND_WRAP,
  jump,
  LAND_SECTION,
  DISPLAY,
  LEDE,
  H2,
  LAND_FEATURES,
} from './stage-landing'

export function landingHeader(name: Look, open: () => void) {
  return (
    <header style="position:sticky;top:0;z-index:2">
      <LookStage look={name} role="header">
        <Row justify="between" gap="related" style={`${LAND_WRAP};padding-block:12px`}>
          <a
            href="#top"
            data-skin="type"
            data-ramp="accent"
            style="font-size:30px;color:inherit"
            onClick={(e: MouseEvent) => jump(e)}
          >
            weft
          </a>
          <Row gap="tight" wrap>
            <a href="#features" data-skin="chip" onClick={(e: MouseEvent) => jump(e, 'features')}>
              Features
            </a>
            <a href="#pricing" data-skin="chip" onClick={(e: MouseEvent) => jump(e, 'pricing')}>
              Pricing
            </a>
            <a href="#faq" data-skin="chip" onClick={(e: MouseEvent) => jump(e, 'faq')}>
              FAQ
            </a>
            <button data-skin="button" onClick={open}>
              Start free
            </button>
          </Row>
        </Row>
        <div data-skin="rule"></div>
      </LookStage>
    </header>
  )
}

export function landingHero(open: () => void) {
  return (
    <section style={LAND_SECTION}>
      <Split side="end" width="half" gap="section">
        <Stack gap="group" align="start">
          <span data-skin="chip" data-ramp="highlight">
            New: edge cache in 14 regions
          </span>
          <h1
            data-skin="type"
            data-ramp="accent"
            style={`${DISPLAY};font-size:clamp(44px,9cqi,96px)`}
          >
            Ship it on canvas.
          </h1>
          <p data-skin="clear" style={LEDE}>
            weft builds, previews and ships every push. This page is one canvas: every surface on it
            is painted, and every control is still real HTML.
          </p>
          <Row gap="related" wrap>
            <button data-skin="button" onClick={open}>
              Start a project
            </button>
            <a
              href="#pricing"
              data-skin="button"
              data-look="outline"
              onClick={(e: MouseEvent) => jump(e, 'pricing')}
            >
              See pricing
            </a>
          </Row>
        </Stack>
        <div
          data-skin="art"
          data-kind="rings"
          data-ramp="accent"
          role="img"
          aria-label="An animated picture"
          style="--stage-art-ratio:4/3;min-block-size:220px"
        ></div>
      </Split>
    </section>
  )
}

export function landingFeatures() {
  return (
    <section data-land="features" style={LAND_SECTION}>
      <Stack gap="group">
        <h2 data-skin="type" style={H2}>
          Less to look after
        </h2>
        <Grid min="md" cols={3} gap="group">
          {LAND_FEATURES.map((f) => (
            <article key={f.title} data-skin="card" style="--stage-pad-card:0.875rem">
              <div data-skin="art" data-kind={f.kind} style="--stage-art-ratio:16/7"></div>
              <h3 style="margin:0;font-size:19px">{f.title}</h3>
              <p style="margin:0;line-height:1.5">{f.body}</p>
            </article>
          ))}
        </Grid>
      </Stack>
    </section>
  )
}

export function landingControls(name: Look, open: () => void, minutes: State<number>) {
  return (
    <section style={LAND_SECTION}>
      <Split side="start" width="half" gap="section">
        <Stack gap="related" align="start">
          <h2 data-skin="type" style={H2}>
            Try the knobs
          </h2>
          <p data-skin="clear" style={LEDE}>
            Fields, checks, a switch and a slider, all painted by the stage. Tab through them: focus
            is drawn round whatever has it.
          </p>
        </Stack>
        {controlsForm(name, open, minutes)}
      </Split>
    </section>
  )
}

function controlsForm(name: Look, open: () => void, minutes: State<number>) {
  return (
    <form
      data-skin="card"
      style="--stage-gap-card:1rem"
      onSubmit={(e: Event) => {
        e.preventDefault()
        open()
      }}
    >
      {controlsFields(name, minutes)}
    </form>
  )
}

function controlsFields(name: Look, minutes: State<number>) {
  return (
    <>
      {identityFields(name)}
      {optionFields()}
      {minuteFields(minutes)}
    </>
  )
}

function identityFields(name: Look) {
  return (
    <>
      <label data-part="label">
        Project name
        <input data-skin="field" required value="storefront" />
      </label>
      <label data-part="label">
        Region
        <StageSelect name="region" options={['eu-west', 'us-east', 'ap-south']} />
      </label>
      <fieldset style="border:0;padding:0;margin:0;display:flex;gap:18px;flex-wrap:wrap">
        <legend style="font-size:14px;font-weight:600;margin-block-end:8px">Runtime</legend>
        <label data-part="option">
          <input type="radio" name={`land-${name}`} data-skin="check" checked />
          Node
        </label>
        <label data-part="option">
          <input type="radio" name={`land-${name}`} data-skin="check" />
          Bun
        </label>
        <label data-part="option">
          <input type="radio" name={`land-${name}`} data-skin="check" />
          Deno
        </label>
      </fieldset>
    </>
  )
}

function optionFields() {
  return (
    <>
      <label data-part="option">
        <input type="checkbox" data-skin="check" checked />
        Preview every pull request
      </label>
      <label data-part="option">
        <input type="checkbox" role="switch" data-skin="switch" checked />
        Deploy on push to main
      </label>
    </>
  )
}

function minuteFields(minutes: State<number>) {
  return (
    <>
      <label data-part="label">
        Build minutes: {minutes.value.toLocaleString('en')}
        <input
          type="range"
          data-skin="range"
          min="0"
          max="6000"
          step="100"
          value={minutes.value}
          onInput={(e: Event) => (minutes.value = +(e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <label data-part="label">
        Of the Team plan's 6,000
        <meter data-skin="meter" min="0" max="6000" value={minutes.value}></meter>
      </label>
      <button data-skin="button">Create project</button>
    </>
  )
}
