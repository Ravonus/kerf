import { state } from '@kerf-js/core'
import { Accordion } from '../../src/Accordion'
import { ArtworkFrame } from '../../src/ArtworkFrame'
import { Button } from '../../src/Button'
import { CelebrationOverlay } from '../../src/CelebrationOverlay'
import { Link } from '../../src/Link'
import { LockedTile } from '../../src/LockedTile'
import { ParticleBurst } from '../../src/ParticleBurst'
import { ParticleField } from '../../src/ParticleField'
import { ProgressivePicture } from '../../src/ProgressivePicture'
import { ResultsToolbar } from '../../src/ResultsToolbar'
import { ScratchReveal } from '../../src/ScratchReveal'
import { SectionHeading } from '../../src/SectionHeading'
import { SeededPlaceholder } from '../../src/SeededPlaceholder'
import { StreakIndicator } from '../../src/StreakIndicator'
import { Input } from '../../src/Field'

/** SVG fixture with alpha corners and a consistent surrounding color. */
export const ROUNDED =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><rect width="96" height="96" rx="12" fill="#be9235"/><circle cx="48" cy="48" r="18" fill="#191919"/></svg>',
  )

function Artwork() {
  const src = state(ROUNDED)
  const scan = state('pending')
  return (
    <section aria-label="Image examples">
      <ArtworkFrame
        src={src.value}
        alt="Rounded artwork"
        aspectRatio={1}
        allowAnalysis
        onAnalysis={(result) => {
          scan.value = result?.reason ?? 'unavailable'
        }}
        fallback={<SeededPlaceholder seed="garden" />}
        style="width: 110px"
      />
      <ProgressivePicture
        src="/late-picture.svg"
        preview={ROUNDED}
        alt="Progressive artwork"
        ratio="4:3"
        eager
        transitionName="artwork"
        style="width: 120px"
      />
      <output id="scan">{scan.value}</output>
      <Button
        onClick={() => {
          src.value = '/missing-art.png'
        }}
      >
        Use missing image
      </Button>
      <SeededPlaceholder
        seed="dunes"
        accessibleLabel="Seeded dunes"
        style="width: 65px; height: 65px"
      />
    </section>
  )
}

function Feedback() {
  const open = state(false)
  const duration = state<number | undefined>(undefined)
  const dismissed = state(0)
  const locked = state(true)
  const calls = state(0)
  return (
    <section aria-label="Feedback examples">
      <Button
        onClick={() => {
          duration.value = undefined
          open.value = true
        }}
      >
        Celebrate
      </Button>
      <Button
        onClick={() => {
          duration.value = 500
          open.value = true
        }}
      >
        Timed celebration
      </Button>
      <CelebrationOverlay
        open={open}
        title="Export complete"
        duration={duration.value}
        onDismiss={() => {
          dismissed.value++
        }}
        media={<span>Decoration</span>}
      >
        <p>The export is available.</p>
      </CelebrationOverlay>
      <output id="dismissed">{dismissed.value}</output>
      <ScratchReveal
        label="Reveal the archive"
        threshold={0.18}
        style="width: 220px; height: 120px"
        onReveal={() => {
          calls.value++
        }}
      >
        <Link href="#archive">Visit archive</Link>
      </ScratchReveal>
      <output id="reveals">{calls.value}</output>
      <LockedTile
        label="History"
        locked={locked.value}
        reason="Finish the review."
        progress={40}
        progressLabel="Review progress"
      >
        <Link href="#history">View history</Link>
      </LockedTile>
      <Button
        onClick={() => {
          locked.value = false
        }}
      >
        Unlock history
      </Button>
    </section>
  )
}

function Layout() {
  const count = state(1200)
  const open = state(['a'])
  return (
    <section aria-label="Layout examples">
      <SectionHeading
        title="Report index"
        level={3}
        eyebrow="Library"
        description="Published reports"
        actions={<Link href="#reports">Browse reports</Link>}
      />
      <ResultsToolbar
        count={count.value}
        noun="records"
        announce
        leading={<span>Verified</span>}
        actions={
          <Button
            onClick={() => {
              count.value++
            }}
          >
            Add result
          </Button>
        }
      />
      <form>
        <div id="external-help">Additional directions</div>
        <Input
          label="Identifier"
          labelContent={<i>ID</i>}
          variant="classic"
          appearance="line"
          id="identifier"
          hint="Enter a number."
          aria-describedby="external-help"
          name="identifier"
          required
          inputmode="numeric"
          attrs={{ 'data-testid': 'field-shell' }}
        />
      </form>
      <Accordion
        open={open.value}
        onChange={(values) => {
          open.value = values
        }}
        multiple
        items={[
          {
            value: 'a',
            title: 'First',
            trailing: <span>New</span>,
            subtitle: 'Optional',
            content: <Link href="#a">First panel link</Link>,
          },
          { value: 'b', title: 'Unavailable', content: 'Hidden', disabled: true },
          { value: 'c', title: 'Last', content: <Link href="#c">Last panel link</Link> },
        ]}
      />
    </section>
  )
}

function Effects() {
  const active = state(true)
  const paused = state(false)
  return (
    <div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap: 6px">
      <ParticleBurst
        data-testid="burst"
        seed="burst"
        active={active.value}
        origin={{ x: 0.5, y: 0.75 }}
        duration={1500}
        speed={100}
        gravity={45}
        sprites={[{ src: ROUNDED }]}
      />
      <ParticleField
        data-testid="field"
        seed="ambient"
        density={20}
        velocity={{ x: 0.3, y: 0.25 }}
        paused={paused.value}
      />
      <StreakIndicator value={8} label="Current streak" thresholds={[2, 7, 14]} detail="Days" />
      <Button
        onClick={() => {
          active.value = !active.value
        }}
      >
        Toggle burst
      </Button>
      <Button
        onClick={() => {
          paused.value = !paused.value
        }}
      >
        Pause or resume field
      </Button>
    </div>
  )
}

/** A browser-ready example gallery that also renders on the server. */
export function VisualExamples() {
  return (
    <main style="padding: 12px; display: grid; gap: 12px">
      <Effects />
      <Artwork />
      <Feedback />
      <Layout />
    </main>
  )
}
