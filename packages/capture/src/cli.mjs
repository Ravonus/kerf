// `weft capture <command>`. A target is a URL, or a built folder served on 127.0.0.1 while the command runs.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseArgs } from 'node:util'
import { bake } from './bake.mjs'
import { launch, open } from './browser.mjs'
import { frames } from './frames.mjs'
import { serve } from './serve.mjs'
import { sheet } from './sheet.mjs'
import { stageReady } from './settle.mjs'
import { capture } from './stills.mjs'
import { parseStop, stopName } from './stops.mjs'

/** The command's help. */
export const USAGE = `weft capture <command> <url | built folder> [options]

  stills <target>   a PNG at each stop     --stops 0,hero@0.5,2+300 --out dir --sheet
  frames <target>   frame times as JSON    --seconds 5 --speed 600 --cpu 4 --driver scroll|wheel --out file
  sheet <png...>    one contact sheet      --out sheet.png --cols 4 --width 480
  bake <target>     scene posters          --out posters --format avif|webp --quality 50 --time 0

  page options      --width 1440 --height 900 --dpr 1 --reduced --mobile --path /page.html --chrome <path>`

const OPTIONS = {
  out: { type: 'string' },
  stops: { type: 'string' },
  sheet: { type: 'boolean' },
  seconds: { type: 'string' },
  speed: { type: 'string' },
  cpu: { type: 'string' },
  driver: { type: 'string' },
  cols: { type: 'string' },
  format: { type: 'string' },
  quality: { type: 'string' },
  time: { type: 'string' },
  width: { type: 'string' },
  height: { type: 'string' },
  dpr: { type: 'string' },
  reduced: { type: 'boolean' },
  mobile: { type: 'boolean' },
  path: { type: 'string' },
  chrome: { type: 'string' },
}

const num = (v, fallback) => (v === undefined ? fallback : Number(v))

/** The page options shared by every command, and the URL: a folder is served first. */
async function page(target, v) {
  if (!target) throw new Error('weft capture: name a URL or a built folder')
  const local = existsSync(target) && statSync(target).isDirectory() ? await serve(target) : null
  const url = (local?.url ?? target) + (typeof v.path === 'string' ? v.path : '')
  const size = {
    width: num(v.width, 1440),
    height: num(v.height, 900),
    dpr: num(v.dpr, 1),
    reduced: !!v.reduced,
    mobile: !!v.mobile,
  }
  const chrome = typeof v.chrome === 'string' ? { executablePath: v.chrome } : {}
  return { url, ...size, ...chrome, close: () => local?.close() }
}

function write(file, data) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data)
}

// Each command reads its options untyped: parseArgs has checked their kinds already.
const COMMANDS = {
  async stills([target], v) {
    const at = await page(target, v)
    const stops = String(v.stops ?? '0')
      .split(',')
      .map(parseStop)
    const browser = await launch(at)
    try {
      const out = v.out ?? 'captures'
      const result = await capture({ ...at, browser, stops, out })
      for (const s of result.stills)
        console.log(`${s.path}  y=${s.y}  ${s.bytes} B  ${s.hash.slice(0, 12)}`)
      if (v.sheet) {
        const labels = result.stills.map((s) => stopName(s.stop))
        write(
          `${out}/sheet.png`,
          await sheet(
            browser,
            result.stills.map((s) => s.png),
            { labels },
          ),
        )
      }
      for (const p of result.problems) console.error(`page: ${p}`)
    } finally {
      await browser.close()
      await at.close()
    }
  },
  async frames([target], v) {
    const at = await page(target, v)
    const browser = await launch(at)
    try {
      const tab = await open(browser, at)
      await stageReady(tab, null)
      const options = { seconds: num(v.seconds, 5), speed: num(v.speed, 600), cpu: num(v.cpu, 1) }
      const result = {
        url: at.url,
        ...(await frames(tab, { ...options, driver: v.driver ?? 'scroll' })),
      }
      const json = `${JSON.stringify(result, null, 2)}\n`
      if (v.out) write(v.out, json)
      else process.stdout.write(json)
    } finally {
      await browser.close()
      await at.close()
    }
  },
  async sheet(files, v) {
    const browser = await launch(typeof v.chrome === 'string' ? { executablePath: v.chrome } : {})
    try {
      const options = {
        cols: num(v.cols, undefined),
        width: num(v.width, undefined),
        labels: files,
      }
      write(
        v.out ?? 'sheet.png',
        await sheet(
          browser,
          files.map((f) => readFileSync(f)),
          options,
        ),
      )
    } finally {
      await browser.close()
    }
  },
  async bake([target], v) {
    const at = await page(target, v)
    try {
      const out = v.out ?? 'posters'
      const quality = num(v.quality, undefined)
      const how = {
        format: v.format ?? 'avif',
        seconds: num(v.time, 0),
        ...(quality ? { quality } : {}),
      }
      const result = await bake({
        url: at.url,
        out,
        ...how,
        ...(v.chrome ? { executablePath: v.chrome } : {}),
      })
      for (const [id, tiers] of Object.entries(result.posters))
        for (const [tier, still] of Object.entries(tiers))
          console.log(
            `${id} ${tier}: ${still.width}x${still.height} ${still.bytes} B in ${still.ms} ms`,
          )
      console.log(`baked in ${result.ms} ms into ${out}/posters.json`)
    } finally {
      await at.close()
    }
  },
}

/** Runs one command; resolves with the exit code. */
export async function main(argv) {
  const [command, ...rest] = argv
  const run = command ? COMMANDS[command] : undefined
  if (!run) {
    console.error(USAGE)
    return command && command !== 'help' ? 2 : 0
  }
  try {
    const { values, positionals } = parseArgs({
      args: rest,
      options: OPTIONS,
      allowPositionals: true,
    })
    await run(positionals, values)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    return 1
  }
}
