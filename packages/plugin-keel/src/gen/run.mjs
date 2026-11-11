// `gen plan` and `gen run`: a recipe's slots through an adapter to bases and a lock. A slot in the lock with its
// basis on disk costs nothing; a request already in the raw cache costs no call; anything else passes the seat guard,
// the deny list and the reference guard before its call, and the run stops cleanly before crossing a cap.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requestDigest, sha256 } from './digest.mjs'
import { GenFailure, GenRefused, referenceGuard, seatGuard } from './guard.mjs'
import { createMockAdapter } from './mock.mjs'
import { pngSize } from './png.mjs'
import { buildPrompt } from './prompt.mjs'
import { deniedTerm, parseOut } from './recipe.mjs'
import {
  appendLedger,
  defaultCacheDir,
  loadRecipe,
  readLock,
  readRaw,
  writeBasis,
  writeLock,
  writeRaw,
} from './store.mjs'

const ZERO = { input: 0, output: 0 }

/** The request a slot makes: its prompt, its guides as inputs with their digests, and the adapter's names. */
function buildRequest(adapter, style, slot, guides, roll) {
  const { prompt, negative } = buildPrompt(style, slot)
  const inputs = guides.map((guide) => {
    const bytes = guide.bytes ?? new Uint8Array(readFileSync(guide.path))
    return { ...guide, bytes, digest: guide.digest ?? sha256(bytes) }
  })
  // A re-roll is a new request, so it misses the cache and the old output stays in it.
  const params = roll ? { ...slot.params, roll } : slot.params
  const { seed, size, n, op } = slot
  return {
    adapter: adapter.id,
    model: adapter.model,
    op,
    prompt,
    negative,
    seed,
    size,
    n,
    params,
    inputs,
  }
}

const isLocked = (entry, dir) => entry !== undefined && existsSync(join(dir, entry.basis.file))
const otherAdapter = (slot, adapter) => slot.via !== undefined && slot.via !== adapter.id

/**
 * The dry run: each slot's state (`locked`, `cached` or `miss`) and what its call would use. Writes nothing and
 * calls nothing. Without `guides` a slot's guides count as none, so a guided slot shows as a miss.
 */
export async function planGen({
  recipeFile,
  cacheDir = defaultCacheDir(),
  adapter = createMockAdapter(),
  deny = [],
  guides,
}) {
  const { slots, style, lockFile, dir } = loadRecipe(recipeFile, { deny })
  const lock = readLock(lockFile)
  const rows = []
  for (const slot of slots) {
    const entry = lock.slots[slot.name]
    const row = { slot: slot.name, adapter: slot.via ?? adapter.id, op: slot.op, n: slot.n }
    if (isLocked(entry, dir)) {
      rows.push({ ...row, state: 'locked', calls: 0, wallMs: 0, seatTokens: 0 })
      continue
    }
    const inputs = guides ? await guides({ slot, name: slot.name }) : []
    const request = buildRequest(adapter, style, slot, inputs, entry?.roll ?? 0)
    if (readRaw(cacheDir, requestDigest(request))) {
      rows.push({ ...row, state: 'cached', calls: 0, wallMs: 0, seatTokens: 0 })
      continue
    }
    const estimate = otherAdapter(slot, adapter)
      ? { calls: 1, wallMs: 0, seatTokens: 0 }
      : adapter.estimate(request)
    const { calls, wallMs, seatTokens } = estimate
    rows.push({ ...row, state: 'miss', calls, wallMs, seatTokens })
  }
  const total = (field) => rows.reduce((sum, row) => sum + row[field], 0)
  return {
    rows,
    totals: { calls: total('calls'), wallMs: total('wallMs'), seatTokens: total('seatTokens') },
  }
}

/** Throws a `GenRefused`, after a ledger line, when the prompt has a denied term or an input is reference material. */
function guardCall(run, slot, request, digest) {
  const refuse = (error) => {
    appendLedger(run.cacheDir, {
      at: new Date().toISOString(),
      slot: slot.name,
      request: digest,
      adapter: request.adapter,
      outcome: 'blocked',
      calls: 0,
      tokens: ZERO,
      durationMs: 0,
      error: error.message,
    })
    throw error
  }
  const term = deniedTerm(`${request.prompt}\n${request.negative ?? ''}`, run.deny)
  if (term)
    refuse(new GenRefused(`keel gen: ${slot.name}: the prompt has the denied term \`${term}\``))
  for (const input of request.inputs) {
    try {
      run.refs.check({ path: input.path, bytes: input.bytes })
    } catch (error) {
      refuse(error)
    }
  }
}

/**
 * Why the outputs are not what was asked for, or `undefined`. A size is a shape: a model that paints at its nearest
 * supported size (1254 for 1024) is right, so only the aspect ratio has to match, within 2%.
 */
function wrongOutputs(result, request) {
  if (!result.outputs?.length) return 'no outputs'
  const [width, height] = request.size?.split('x').map(Number) ?? []
  for (const bytes of result.outputs) {
    const got = pngSize(bytes)
    if (width !== undefined && Math.abs((got.width * height) / (got.height * width) - 1) > 0.02)
      return `asked for ${request.size}, got ${got.width}x${got.height}`
  }
  return undefined
}

/** The provenance kept beside a request's raw outputs (`keel-provenance@1`). */
function provenanceOf(slot, request, digest, result, at) {
  const { adapter, op, prompt, negative, seed, size, n, params } = request
  return {
    provenance: 'keel-provenance@1',
    slot: slot.name,
    request: digest,
    adapter,
    model: result.model ?? request.model,
    op,
    prompt,
    negative,
    seed,
    size,
    n,
    params,
    inputs: request.inputs.map((input) => ({
      role: input.role,
      digest: input.digest,
      pixels: sha256(input.bytes),
    })),
    outputs: result.outputs.map((bytes) => ({
      digest: sha256(bytes),
      bytes: bytes.length,
      ...pngSize(bytes),
    })),
    tokens: result.tokens ?? ZERO,
    durationMs: result.durationMs,
    requestId: result.requestId,
    at,
  }
}

/**
 * Calls the adapter for a request, within the slot's `calls` and the run's caps. Gives `{ raw }`, `{ stopped }` when
 * the next call would cross a cap, or `{ failed }` when the slot's calls ran out.
 */
async function callFor(run, slot, request, digest) {
  let made = 0
  let failure
  for (;;) {
    const estimate = run.adapter.estimate(request)
    if (made && made + estimate.calls > slot.calls) return { failed: failure }
    const over = run.seat.fits(estimate)
    if (over) return { stopped: over }
    guardCall(run, slot, request, digest)
    const at = new Date().toISOString()
    const line = {
      at,
      slot: slot.name,
      request: digest,
      adapter: run.adapter.id,
      calls: estimate.calls,
    }
    let result
    try {
      result = await run.adapter.run(request, { signal: AbortSignal.timeout(run.seat.left()) })
    } catch (error) {
      run.seat.spend(estimate.calls, ZERO)
      const outcome = error instanceof GenFailure ? error.outcome : 'failed'
      appendLedger(run.cacheDir, {
        ...line,
        outcome,
        tokens: ZERO,
        durationMs: 0,
        error: error.message,
      })
      if (!(error instanceof GenFailure)) throw error
      run.log(`${slot.name}: ${outcome}: ${error.message}`)
      failure = error.message
      made += estimate.calls
      continue
    }
    const tokens = result.tokens ?? ZERO
    run.seat.spend(estimate.calls, tokens)
    const wrong = wrongOutputs(result, request)
    const outcome = wrong ? 'wrong-size' : 'ok'
    const { durationMs } = result
    appendLedger(run.cacheDir, {
      ...line,
      outcome,
      tokens,
      durationMs,
      ...(wrong ? { error: wrong } : {}),
    })
    if (!wrong) {
      run.log(`${slot.name}: ${result.outputs.length} output(s) in ${durationMs} ms`)
      return {
        raw: writeRaw(
          run.cacheDir,
          digest,
          result.outputs,
          provenanceOf(slot, request, digest, result, at),
        ),
      }
    }
    run.log(`${slot.name}: wrong-size: ${wrong}`)
    failure = wrong
    made += estimate.calls
  }
}

/**
 * The critic's pick among several candidates; 0 without a critic. Every image the critic sees passes the reference
 * guard, and each `critique` call it makes passes the seat guard and goes on the ledger.
 */
async function choose(run, slot, candidates, guides, digest) {
  if (!run.critic || candidates.length < 2) return { pick: 0 }
  for (const image of [...candidates, ...guides]) run.refs.check(image)
  let stopped
  const critique =
    run.adapter.critique &&
    (async (ask) => {
      for (const path of ask.images) run.refs.check({ path })
      stopped = run.seat.fits({ calls: 1, wallMs: 0 })
      if (stopped) throw new Error(`keel gen: ${stopped}`)
      const result = await run.adapter.critique(ask, {
        signal: AbortSignal.timeout(run.seat.left()),
      })
      run.seat.spend(1, result.tokens)
      appendLedger(run.cacheDir, {
        at: new Date().toISOString(),
        slot: slot.name,
        request: digest,
        adapter: run.adapter.id,
        outcome: 'critic',
        calls: 1,
        tokens: result.tokens ?? ZERO,
        durationMs: 0,
      })
      return result
    })
  try {
    const verdict = await run.critic({ slot, candidates, guides, critique })
    run.seat.spend(0, verdict.tokens)
    const pick = Number.isInteger(verdict.pick) && candidates[verdict.pick] ? verdict.pick : 0
    return { pick, scores: verdict.scores }
  } catch (error) {
    if (!stopped) throw error
    return { pick: 0, stopped }
  }
}

/** One slot: locked, or made (or read from the raw cache), chosen, distilled and written to the lock. */
async function runSlot(run, slot) {
  const { adapter, lock, loaded } = run
  const name = slot.name
  if (otherAdapter(slot, adapter))
    return { slot: name, state: 'skipped', reason: `via ${slot.via}` }
  const entry = lock.slots[name]
  const reroll = run.reroll.has(name)
  if (!reroll && isLocked(entry, loaded.dir)) return { slot: name, state: 'locked' }
  const guides = await run.guides({ slot, name })
  const roll = (entry?.roll ?? 0) + (reroll ? 1 : 0)
  const request = buildRequest(adapter, loaded.style, slot, guides, roll)
  const digest = requestDigest(request)
  let raw = readRaw(run.cacheDir, digest)
  const state = raw ? 'cached' : 'made'
  if (!raw) {
    const called = await callFor(run, slot, request, digest)
    if (called.stopped) return { slot: name, state: 'stopped', stopped: called.stopped }
    if (called.failed) return { slot: name, state: 'failed', error: called.failed }
    raw = called.raw
  }
  const { pick, scores, stopped } = await choose(run, slot, raw.candidates, request.inputs, digest)
  const out = parseOut(slot.out)
  const basis = await run.distil({
    slot,
    out,
    candidates: raw.candidates,
    chosen: pick,
    guides: request.inputs,
  })
  const written = writeBasis(loaded.dir, basis.bytes)
  const { adapter: by, model, tokens, durationMs, at } = raw.provenance
  lock.slots[name] = {
    request: digest,
    candidate: pick,
    ...(roll ? { roll } : {}),
    basis: { ...written, kind: basis.kind, dims: basis.dims, params: basis.params },
    provenance: { adapter: by, model, tokens, durationMs, at, scores },
  }
  writeLock(loaded.lockFile, lock)
  return {
    slot: name,
    state,
    request: digest,
    candidate: pick,
    basis: written.file,
    ...(stopped ? { stopped } : {}),
  }
}

/**
 * Runs a recipe's slots in dependency order. Needs both caps: `maxCalls` and `maxWallMs`. Each slot's lock entry is
 * written as it finishes, so a run that stops leaves a consistent lock.
 */
export async function runGen(options) {
  const seat = seatGuard(options)
  const { recipeFile, adapter, distil, critic, reference = [], deny = [], reroll = [] } = options
  if (!adapter || typeof distil !== 'function')
    throw new Error('keel gen: a run needs an `adapter` and `distil`')
  const loaded = loadRecipe(recipeFile, { deny })
  const unknown = reroll.filter((name) => !loaded.slots.some((slot) => slot.name === name))
  if (unknown.length) throw new Error(`keel gen: no slot to re-roll: ${unknown.join(', ')}`)
  const run = {
    adapter,
    critic,
    distil,
    deny,
    seat,
    loaded,
    guides: options.guides ?? (() => []),
    refs: referenceGuard(reference),
    lock: readLock(loaded.lockFile),
    reroll: new Set(reroll),
    cacheDir: options.cacheDir ?? defaultCacheDir(),
    log: options.log ?? (() => {}),
  }
  const slots = []
  let stopped
  for (const slot of loaded.slots) {
    const result = await runSlot(run, slot)
    slots.push(result)
    if (result.stopped) {
      stopped = { reason: result.stopped, slot: slot.name }
      run.log(`stopped at ${slot.name}: ${result.stopped}`)
      break
    }
  }
  return { calls: seat.calls, tokens: { ...seat.tokens }, ...(stopped ? { stopped } : {}), slots }
}
