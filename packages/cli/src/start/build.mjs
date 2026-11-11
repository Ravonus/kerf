import { audit, builtPublic } from '../audit.mjs'
import { writeMap } from '../map.mjs'
import { diagnostic } from '../diag.mjs'
import { loadConfig } from '../load-config.mjs'
import { host, presetFor } from '../deploy/hosts.mjs'

export async function finishBuild({
  root,
  config,
  preset,
  rust,
  refuse,
  running,
  shipSidecars,
  output,
  warned,
  unsafe,
  forced,
  loaded,
  t,
  writeContract,
}) {
  const contract = await writeContract({
    root,
    site: config.site,
    preset,
    rust,
    live: (await loadConfig(root)).config?.live,
    verify: true,
  })
  for (const refused of contract.diagnostics.filter((d) => d.severity === 'error')) refuse(refused)
  if (running) shipSidecars(root)
  await writeMap(root)
  // Last, the pages as built, in a clean Chrome at a phone's width and a desktop's (audit.mjs): an error fails the build.
  const settings = (await loadConfig(root)).config?.build?.audit ?? true
  const audited =
    settings === false
      ? {
          diagnostics: [
            diagnostic({
              code: 'L000',
              severity: 'warning',
              file: 'kerf.config.ts',
              why: '`build.audit` is false: the built pages were not audited.',
            }),
          ],
        }
      : await audit(root, {
          dir: builtPublic(root),
          ...(typeof settings === 'object' && settings),
        })
  const pages = audited.diagnostics.map((d) =>
    d.severity === 'error' && unsafe.allows(d) ? unsafe.let(d) : d,
  )
  const kept = [
    ...contract.diagnostics.filter((d) => !(d.severity === 'error' && unsafe.allows(d))),
    ...warned,
  ].map((d) => diagnostic({ file: '.kerf/contract.json', ...d }))
  const diagnostics = [
    ...kept,
    ...pages,
    ...forced.map((d) => diagnostic({ file: '.kerf/contract.json', ...d })),
  ]
  return {
    ok: !diagnostics.some((d) => d.severity === 'error'),
    preset,
    output,
    contract: contract.path,
    functions: contract.functions,
    notes: loaded.contributions.flatMap((c) => c.manifest.notes ?? []),
    audited: audited.pages?.length ?? 0,
    diagnostics,
    ms: Math.round(performance.now() - t),
  }
}

export async function startBuildSidecars({
  start,
  root,
  config,
  preset,
  rust,
  refuse,
  writeContract,
}) {
  const { buildSidecars, shipSidecars, startSidecars, usesRemote } = await start(root, 'sidecar')
  const contracted = () => writeContract({ root, site: config.site, preset, rust })
  let warned = []
  // Sidecars first: prerendering a share card runs its route's `load`, which may read one.
  const running = usesRemote(root)
    ? await contracted().then(async (c) => {
        const stop = c.diagnostics.find((d) => d.severity === 'error')
        if (stop) refuse(stop)
        const built = await buildSidecars({ root, contract: c.contract, rust, preset })
        const failed = built.diagnostics.find((d) => d.severity === 'error')
        if (failed) refuse(failed)
        warned = built.diagnostics
        return startSidecars({ root, built: true, log: () => {} })
      })
    : undefined
  return { running, warned, shipSidecars }
}

export async function buildPreset(root, { preset, runtime, hostRuntime, PRESETS }) {
  const chosen = runtime ?? (await loadConfig(root)).config?.runtime ?? hostRuntime()
  // `deploy.target` picks the preset when nothing else does: a build for Fly is the runtime's server, for Netlify `netlify`
  const target = !preset && !runtime && (await loadConfig(root)).config?.deploy?.target
  if (target) preset = presetFor(host(target), chosen)
  if (!preset && !PRESETS[chosen])
    throw Object.assign(
      new Error(`unknown runtime "${chosen}": use ${Object.keys(PRESETS).join(', ')}`),
      { code: 'E_USAGE' },
    )
  preset ??= PRESETS[chosen]
  return preset
}
