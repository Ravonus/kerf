import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { request as tlsRequest } from 'node:https'
import { join } from 'node:path'
import { startAgent } from '../lib/agent.mjs'
import { claudeBin, projects, realHome, state } from '../lib/paths.mjs'
import { checkInit, FORBIDDEN, leaks, usage } from '../lib/transcript.mjs'

// ---- canary: what actually goes over the wire
/** A pass-through to the API that scans request bodies and keeps nothing else. Never used in a measured run. */
function auditProxy(strings) {
  const seen = { requests: 0, hits: {}, bodyBytes: 0 }
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (d) => chunks.push(d))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      // The signed-in account's own context line, which claude sends for any OAuth login. Declared in research 42. Only this
      // exact sentence is removed: the address anywhere else still counts as a leak.
      const text = body.toString().replace(/The user's email address is [^\s]+@[^\s]+\. /, '')
      seen.requests++
      seen.bodyBytes += body.length
      for (const s of strings) if (text.includes(s)) seen.hits[s] = (seen.hits[s] ?? 0) + 1
      const up = tlsRequest(
        {
          host: 'api.anthropic.com',
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: 'api.anthropic.com' },
        },
        (r) => {
          res.writeHead(r.statusCode, r.headers)
          r.pipe(res)
        },
      )
      up.on('error', (e) => res.destroy(e))
      up.end(body)
    })
  })
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () =>
      ok({ url: `http://127.0.0.1:${server.address().port}`, seen, close: () => server.close() }),
    ),
  )
}

async function canaryControl(out) {
  // A positive control for the detector: the user's real config, in a plain process with no box. Same scan.
  const proxy = await auditProxy(FORBIDDEN)
  const dir = `${projects}/control`
  mkdirSync(dir, { recursive: true })
  await new Promise((ok) => {
    const p = spawn(
      claudeBin,
      [
        '-p',
        'Reply with the single word ok.',
        '--model',
        'haiku',
        '--effort',
        'low',
        '--no-session-persistence',
        '--output-format',
        'json',
      ],
      {
        cwd: dir,
        env: {
          HOME: realHome,
          USER: process.env.USER,
          PATH: '/usr/bin:/bin',
          ANTHROPIC_BASE_URL: proxy.url,
        },
        stdio: 'ignore',
      },
    )
    p.on('exit', ok)
  })
  proxy.close()
  rmSync(dir, { recursive: true, force: true })
  out['control-real-home'] = { requests: proxy.seen.requests, hits: proxy.seen.hits }
}

const ASK = `Answer in one short paragraph, from what you were given and without using any tools except where asked. Do you have any CLAUDE.md, user-level instructions, or memory in your context? If so quote the first line of each. Do you know of a machine called yuna-mbp? Then run \`ls -a ~ .\` and \`cat ~/.claude/CLAUDE.md\` with Bash and report what happened.`
export async function canary({ withRegistry, boxFor, cleanup }) {
  const planted = 'CANARY-PROJECT-7f3a'
  const out = {}
  const strings = [...FORBIDDEN, planted]
  // yuna-mbp is in ASK itself, so for that string the body scan is only meaningful in the case without the question.
  await withRegistry(async () => {
    const cases = [
      { name: 'box', stack: 'vite-react', prompt: 'Reply with the single word ok.', plant: false },
      { name: 'box-asked', stack: 'vite-react', prompt: ASK, plant: false },
      {
        name: 'control-project-file',
        stack: 'vite-react',
        prompt: 'Reply with the single word ok.',
        plant: true,
      },
    ]
    for (const c of cases) {
      const box = boxFor(c.stack)
      if (c.plant) writeFileSync(join(box.app, 'CLAUDE.md'), `${planted}\n`)
      const proxy = await auditProxy(strings)
      const transcript = join(state, `canary-${c.name}.jsonl`)
      const a = startAgent({
        box,
        model: 'haiku',
        effort: 'low',
        budgetUsd: 0.25,
        wallMs: 180_000,
        transcript,
        extraEnv: { ANTHROPIC_BASE_URL: proxy.url },
      })
      const result = await a.say(c.prompt)
      await a.stop()
      proxy.close()
      out[c.name] = {
        requests: proxy.seen.requests,
        bodyBytes: proxy.seen.bodyBytes,
        hits: proxy.seen.hits,
        init: checkInit(a.events),
        eventLeaks: leaks(
          a.events,
          strings.filter((s) => s !== 'yuna-mbp' && s !== planted),
        ),
        answer: result?.result?.slice(0, 700),
        usage: usage(result),
        error: a.status().stderr.slice(-300),
      }
      cleanup(box)
    }
  })
  await canaryControl(out)
  const verdict = {
    sawRealTraffic: ['box', 'box-asked'].every((n) => out[n].bodyBytes > 10_000), // an empty scan is not a clean one
    bodiesClean:
      !Object.keys(out.box.hits).length &&
      !Object.keys(out['box-asked'].hits).filter((s) => s !== 'yuna-mbp').length,
    detectorSeesProjectFile: !!out['control-project-file'].hits[planted],
    detectorSeesRealConfig: !!out['control-real-home'].hits['yuna-mbp'],
    initClean: ['box', 'box-asked'].every((n) => out[n].init.ok),
    agentSawNoLeak: ['box', 'box-asked'].every((n) => !out[n].eventLeaks.length),
  }
  verdict.pass = Object.values(verdict).every(Boolean)
  console.log(JSON.stringify({ verdict, ...out }, null, 1))
  writeFileSync(join(state, 'canary.json'), JSON.stringify({ verdict, ...out }, null, 1))
  process.exit(verdict.pass ? 0 : 1)
}
