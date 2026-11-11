// The dev listener's thread (research 44 §7). It takes file names, waits out a burst of saves, and works out what they
// changed. HMR never waits on it: the main thread only posts a name here, and TypeScript runs in its own process.

const { createHash } = require('node:crypto')
const { mkdirSync, readFileSync, renameSync, writeFileSync } = require('node:fs')
const { join, relative } = require('node:path')
const { parentPort, workerData } = require('node:worker_threads')
const ts = require('typescript')
const { Session } = require('./session.cjs')

const { root, write, debounce = 25, settle = 400, rest = 120_000 } = workerData
const session = new Session(ts, root)
const pending = new Set()
let timer = null,
  running = false,
  last = '',
  writes = null,
  resting = null

function publish(list) {
  const text = JSON.stringify(list)
  if (text === last) return false
  last = text
  mkdirSync(join(root, '.kerf'), { recursive: true })
  const file = join(root, '.kerf', 'props.json')
  writeFileSync(`${file}.tmp`, `${JSON.stringify({ diagnostics: list }, null, 2)}\n`)
  renameSync(`${file}.tmp`, file)
  return true
}

const applyEdits = (text, edits) =>
  [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce((t, e) => t.slice(0, e.start) + e.text + t.slice(e.end), text)

/** Exported types go into the source once the file has been quiet, and only if it's still the text they were made from. */
function scheduleWrites(findings) {
  clearTimeout(writes)
  if (!write) return
  const jobs = [...findings].flatMap(([file, list]) => {
    const edits = list.filter((f) => f.safe && f.edits).flatMap((f) => f.edits)
    return edits.length
      ? [
          {
            file,
            edits,
            hash: session.engine.facts.get(file)?.hash,
            codes: list.map((f) => f.code),
          },
        ]
      : []
  })
  if (!jobs.length) return
  writes = setTimeout(() => {
    for (const job of jobs) {
      const text = readFileSync(job.file, 'utf8')
      if (createHash('sha1').update(text).digest('base64url').slice(0, 16) !== job.hash) continue
      writeFileSync(job.file, applyEdits(text, job.edits))
      parentPort.postMessage({ type: 'wrote', file: relative(root, job.file) })
    }
  }, settle)
}

/** The checker holds a few hundred MB, so it goes after two quiet minutes. The next save starts it again. */
function rested() {
  clearTimeout(resting)
  resting = setTimeout(() => session.close(), rest)
  resting.unref()
}

async function first() {
  running = true
  try {
    await report(performance.now())
  } catch (e) {
    parentPort.postMessage({ type: 'failed', message: e.stack })
  } finally {
    running = false
  }
  await drain()
}

async function report(t, files) {
  const { findings, errors } = await session.analyze(files)
  const flat = []
  for (const [file, list] of [...findings, ...errors])
    for (const f of list)
      flat.push({
        file: relative(root, file),
        line: session.engine.texts.get(file).slice(0, f.start).split('\n').length,
        code: f.code,
        severity: f.severity ?? 'error',
        why: f.why,
        help: f.help,
      })
  scheduleWrites(findings)
  const changed = publish(flat)
  rested()
  parentPort.postMessage({
    type: 'done',
    ms: performance.now() - t,
    at: Date.now(),
    changed,
    diagnostics: flat,
  })
}

async function drain() {
  if (running) return
  running = true
  try {
    while (pending.size) {
      const files = [...pending]
      pending.clear()
      const t = performance.now()
      let changed = false
      for (const f of files) if (session.engine.set(f)) changed = true
      if (session.host) session.touch(files)
      if (!changed || !files.some((f) => session.engine.relevant(f))) {
        parentPort.postMessage({ type: 'idle', ms: performance.now() - t })
        continue
      }
      await report(t, files)
    }
  } catch (e) {
    parentPort.postMessage({ type: 'failed', message: e.stack })
  } finally {
    running = false
  }
}

parentPort.on('message', (msg) => {
  if (msg === 'close') {
    clearTimeout(timer)
    clearTimeout(writes)
    session.close()
    process.exit(0)
  }
  pending.add(msg)
  clearTimeout(timer)
  timer = setTimeout(() => void drain(), debounce)
})

parentPort.postMessage({ type: 'ready', needed: session.engine.needed() })
if (session.engine.needed()) void first()
