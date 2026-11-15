// A movie's first decoded frame is a sharp responsive image, independently cached from playback encoding.
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { measuredFrame } from './frame-quality.mjs'
import { losslessImages } from './lossless.mjs'

async function digest(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function rendition(png, width, ctx) {
  const { data, info } = await sharp(png)
      .resize({ width })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    geometry = {
      reference: data,
      width: info.width,
      height: info.height,
      rect: { x: 0, y: 0, width: info.width, height: info.height },
      stem: `${ctx.stem}-${width}`,
    }
  const files = {},
    scores = {}
  for (const format of ['webp', 'avif']) {
    if (ctx.scorer) {
      const out = await measuredFrame(
        geometry,
        { target: ctx.target, formats: [format], scorer: ctx.scorer },
        ctx.dir,
      )
      files[format] = out.files.find((file) => file.type === `image/${format}`)
      scores[format] = out.score
    } else {
      const exact = await losslessImages(data, info.width, info.height, [format], geometry.stem)
      files[format] = exact.find((file) => file.type === `image/${format}`)
      scores[format] = 100
    }
  }
  const fallback = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer()
  return {
    width,
    height: info.height,
    files,
    scores,
    png: { name: `${geometry.stem}.png`, bytes: fallback, type: 'image/png' },
  }
}

async function prepare(file, ctx) {
  const info = await ctx.provider.info(file)
  if (!info.video || info.video.hdr)
    throw new Error('A sharp first frame requires a supported SDR video track')
  const top = Math.min(info.video.width, ctx.widths.at(-1)),
    widths = [...new Set([...ctx.widths.filter((width) => width < top), top])],
    png = await ctx.provider.still(file, { at: 0, width: top }),
    rungs = []
  for (const width of widths) rungs.push(await rendition(png, width, ctx))
  const fallback = rungs.every((rung) => rung.files.webp) ? 'webp' : 'png',
    avif = rungs.every(
      (rung) =>
        rung.files.avif &&
        rung.files.avif.bytes.length < (rung.files[fallback] ?? rung.png).bytes.length,
    ),
    formats = avif ? ['avif', fallback] : [fallback],
    files = []
  const sources = formats.map((format) => ({
    type: `image/${format}`,
    srcset: rungs
      .map((rung) => {
        const output = rung.files[format] ?? rung.png
        files.push(output)
        return `${output.name} ${rung.width}w`
      })
      .join(', '),
  }))
  const last = rungs.at(-1)
  return {
    asset: {
      kind: 'graphic',
      src: (last.files[fallback] ?? last.png).name,
      type: `image/${fallback}`,
      width: top,
      height: last.height,
      name: `${basename(file)} first frame`,
      quality: ctx.scorer ? 'ssimulacra2' : 'original',
      sources,
    },
    files,
    verification: {
      frameTime: 0,
      sourceSha256: ctx.sourceHash,
      target: ctx.scorer ? ctx.target : 100,
      pixels: ctx.scorer ? 'perceptual' : 'exact',
      widths,
      scores: rungs.map((rung) => ({ width: rung.width, ...rung.scores })),
      placeholder: 'none',
    },
  }
}

/** Shared build provider for sharp AVIF/WebP movie first frames, with no enlarged blur placeholder. */
export function createFirstFrameBuild({
  widths = [384, 640, 960, 1600],
  target = 100,
  scorer = target === 100 ? 'none' : 'ssimulacra2',
} = {}) {
  if (
    !Array.isArray(widths) ||
    !widths.length ||
    !widths.every((width) => Number.isSafeInteger(width) && width > 0)
  )
    throw new TypeError('First-frame widths must be positive integers')
  if (!(target > 0 && target <= 100) || typeof scorer !== 'string')
    throw new TypeError('First-frame quality needs a target from 1 to 100 and a scorer command')
  widths = [...new Set(widths)].sort((a, b) => a - b)
  const available = scorer !== 'none' && !spawnSync(scorer, [], { encoding: 'utf8' }).error
  return {
    async build({ file }, { cacheDir, encode }) {
      const provider = encode['video/h264']
      if (!provider) throw new Error('First-frame preparation requires mediaFfmpeg()')
      const sourceHash = await digest(file),
        key = createHash('sha256')
          .update(
            JSON.stringify({
              version: 1,
              sourceHash,
              widths,
              target,
              scorer: available ? scorer : null,
              sharp: sharp.versions,
              provider: await provider.versions(),
            }),
          )
          .digest('hex'),
        dir = join(cacheDir, 'first-frames', key),
        record = join(dir, 'record.json')
      if (existsSync(record)) {
        const hit = JSON.parse(readFileSync(record, 'utf8'))
        return {
          ...hit,
          files: hit.files.map((name) => ({ name, bytes: readFileSync(join(dir, name)) })),
        }
      }
      const temporary = mkdtempSync(join(tmpdir(), 'kerf-first-frame-'))
      try {
        const out = await prepare(file, {
          provider,
          widths,
          target,
          sourceHash,
          scorer: available ? scorer : null,
          dir: temporary,
          stem: `first-${sourceHash.slice(0, 20)}`,
        })
        mkdirSync(dir, { recursive: true })
        for (const output of out.files) writeFileSync(join(dir, output.name), output.bytes)
        writeFileSync(
          record,
          JSON.stringify({ ...out, files: out.files.map((output) => output.name) }),
        )
        return out
      } finally {
        rmSync(temporary, { recursive: true, force: true })
      }
    },
  }
}
