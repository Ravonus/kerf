// The gallery's order. The route reads these on the server for names, notes and source; the stage loads each file on its own.
import { meta as warpBeam } from './warp-beam'
import { meta as tideTable } from './tide-table'
import { meta as moireLoom } from './moire-loom'
import { meta as turingCloth } from './turing-cloth'
import { meta as survey } from './survey'
import { meta as wovenWord } from './woven-word'
import { meta as darkroom } from './darkroom'
import { meta as rampWall } from './ramp-wall'
import { meta as shuttle } from './shuttle'
import { meta as curlThreads } from './curl-threads'
import { meta as truchetCloth } from './truchet-cloth'
import { meta as bobbin } from './bobbin'
import { meta as longThread } from './long-thread'
import { meta as selvedgePlan } from './selvedge-plan'
import { meta as ridgeline } from './ridgeline'
import { meta as draft } from './draft'
import { meta as plasmaInk } from './plasma-ink'
import { meta as bobbinSdf } from './bobbin-sdf'
import { meta as caustics } from './caustics'
import { meta as badSignal } from './bad-signal'
import { meta as commitWeave } from './commit-weave'
import { meta as latencyRain } from './latency-rain'
import { meta as bundleTartan } from './bundle-tartan'
import { meta as tokenSpectrum } from './token-spectrum'
import { meta as socketTide } from './socket-tide'
import { meta as pluck } from './pluck'
import { meta as filings } from './filings'
import { meta as sandTable } from './sand-table'
import type { Kind, Meta } from './shared'

export const ROOMS: {
  kind: Kind
  title: string
  intro: string
  pieces: [slug: string, meta: Meta][]
}[] = [
  {
    kind: 'field',
    title: 'Dither fields',
    intro: 'Tones and a few inks. The picture is whatever the threshold leaves behind.',
    pieces: [
      ['warp-beam', warpBeam],
      ['tide-table', tideTable],
      ['moire-loom', moireLoom],
      ['turing-cloth', turingCloth],
      ['survey', survey],
      ['woven-word', wovenWord],
      ['darkroom', darkroom],
      ['ramp-wall', rampWall],
    ],
  },
  {
    kind: 'generative',
    title: 'Generative',
    intro: 'Rules, a seed and hairlines. Each of these could be printed and hung.',
    pieces: [
      ['shuttle', shuttle],
      ['curl-threads', curlThreads],
      ['truchet-cloth', truchetCloth],
      ['bobbin', bobbin],
      ['long-thread', longThread],
      ['selvedge-plan', selvedgePlan],
      ['ridgeline', ridgeline],
      ['draft', draft],
    ],
  },
  {
    kind: 'shader',
    title: 'Shaders on whole cells',
    intro:
      'Per-pixel work, at a resolution small enough to stay cheap and big enough to read as ink.',
    pieces: [
      ['plasma-ink', plasmaInk],
      ['bobbin-sdf', bobbinSdf],
      ['caustics', caustics],
      ['bad-signal', badSignal],
    ],
  },
  {
    kind: 'data',
    title: 'Data as cloth',
    intro: 'Figures you could read in a table, and can: each piece carries one for screen readers.',
    pieces: [
      ['commit-weave', commitWeave],
      ['latency-rain', latencyRain],
      ['bundle-tartan', bundleTartan],
      ['token-spectrum', tokenSpectrum],
      ['socket-tide', socketTide],
    ],
  },
  {
    kind: 'pointer',
    title: 'For your hand',
    intro: 'Nothing happens until you touch them, and they cost nothing until you do.',
    pieces: [
      ['pluck', pluck],
      ['filings', filings],
      ['sand-table', sandTable],
    ],
  },
]
