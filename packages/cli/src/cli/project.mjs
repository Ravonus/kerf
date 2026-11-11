export async function commandLsp({ args }) {
  const { lsp } = await import('../infer/lsp.mjs')
  const out = lsp(args.root)
  return await new Promise((ok) => {
    out.server.on('exit', () => ok(0))
  })
}

export async function commandTsc({ formatHuman, sortDiagnostics, args, print, say }) {
  const { propTsc } = await import('../props-checks.mjs')
  const diagnostics = sortDiagnostics(await propTsc(args.root))
  if (args.json) print({ ok: !diagnostics.some((d) => d.severity === 'error'), diagnostics })
  say(formatHuman(diagnostics))
  say(`kerf tsc: ${diagnostics.filter((d) => d.severity === 'error').length} errors`)
  return diagnostics.some((d) => d.severity === 'error') ? 1 : 0
}

export async function commandCheck({ check, formatHuman, compilerLine, doctor, args, print, say }) {
  const result = await check(args.root, { files: args.positional, preset: args.flags.preset })
  if (args.json) print(result)
  say(formatHuman(result.diagnostics))
  if (args.flags.verbose) say(compilerLine(doctor(args.root).compiler))
  say(
    `kerf check: ${result.summary.files} files, ${result.summary.errors} errors, ${result.summary.warnings} warnings (${result.ms} ms)`,
  )
  return result.ok ? 0 : 1
}

export async function commandDoctor({
  existsSync,
  join,
  formatHuman,
  doctor,
  formatDoctor,
  loadConfig,
  doctorCommand,
  formatHosts,
  hostsCommand,
  args,
  print,
  say,
}) {
  // What this install compiles with, always; what live data does on the target, for an app that has any.
  const result = doctor(args.root)
  const plan =
    args.flags.preset || existsSync(join(args.root, 'src/realtime.server.ts'))
      ? await doctorCommand(args.root, {
          preset: args.flags.preset,
          runtime: args.flags.runtime,
        })
      : undefined
  const hosts = hostsCommand(args.root, (await loadConfig(args.root)).config)
  if (args.json) print({ ...result, live: plan, deploy: hosts })
  else
    say(
      `${formatDoctor(result)}\n\nkerf doctor: deploy${hosts.target ? ` (target ${hosts.target})` : ''}\n${formatHosts(hosts).replace(/^/gm, '  ')}`,
    )
  if (!plan) return 0
  say(
    `kerf doctor: ${plan.preset} (${plan.host})\n  live mode: ${plan.mode}\n  ${plan.says}${plan.required.length ? `\n  required: ${plan.required.join(', ')}` : ''}${plan.options.length ? `\n  options:\n${plan.options.map((o) => `    - ${o}`).join('\n')}` : ''}`,
  )
  say(formatHuman(plan.diagnostics))
  return plan.diagnostics.some((d) => d.severity === 'error') ? 1 : 0
}

export async function commandTest({ formatHuman, formatGate, gate, args, print, say }) {
  if (!args.flags.gate)
    throw Object.assign(
      new Error('`kerf test` runs the gate with --gate; run the suite itself with vitest'),
      { code: 'E_USAGE' },
    )
  const num = (name) => (args.flags[name] === undefined ? undefined : Number(args.flags[name]))
  const result = await gate(args.root, {
    base: args.flags.base,
    budgetSec: num('budget'),
    maxMutants: num('max-mutants'),
    concurrency: num('concurrency'),
    refactor: !!args.flags.refactor,
    mutation: !args.flags['no-mutation'],
    log: (line) => say(line),
  })
  if (args.json) print(result)
  say(formatHuman(result.diagnostics))
  say(formatGate(result))
  say(
    `kerf test --gate: ${result.ok ? 'pass' : 'fail'}, ${result.summary.changedTests} changed tests, ${result.summary.errors} errors, ${result.summary.warnings} warnings (${result.ms} ms)`,
  )
  return result.ok ? 0 : 1
}

export async function commandBrowser({ browserCommand, args, print, say, io }) {
  return await browserCommand(args, { print, say, io })
}

export async function commandDev({ devCommand, args, say }) {
  const server = await devCommand(args.root, {
    port: args.flags.port && Number(args.flags.port),
  })
  say(`kerf dev: ${server.resolvedUrls.local[0]}`)
  await new Promise((ok) => {
    process.once('SIGINT', ok)
  })
  await server.close()
  return 0
}

export async function commandBuild({ formatHuman, buildCommand, args, print, say }) {
  const result = await buildCommand(args.root, {
    preset: args.flags.preset,
    runtime: args.flags.runtime,
    unsafeAllow: args.flags['unsafe-allow'],
  })
  if (args.json) print(result)
  say(formatHuman(result.diagnostics))
  say(
    `kerf build: ${result.preset} → ${result.output}, ${result.functions} functions in the contract, ${result.audited} pages audited (${result.ms} ms)`,
  )
  for (const note of result.notes ?? []) say(note)
  if (!result.ok)
    say(
      'kerf build: failed. The output is written, but fix the errors above before it ships, or `--unsafe-allow <code>` to force it.',
    )
  return result.ok ? 0 : 1
}

export async function commandAudit({ formatHuman, audit, args, print, say }) {
  const result = await audit(args.root, {
    url: args.flags.url,
    indexing: args.flags.indexing,
    routes: args.positional.length ? args.positional : undefined,
    all: !!args.flags.all,
    max: args.flags.max && Number(args.flags.max),
  })
  if (args.json) print(result)
  say(formatHuman(result.diagnostics))
  say(
    `kerf audit: ${result.skipped ?? `${result.pages.length} pages at a phone's and a desktop's width, ${result.diagnostics.length} findings (${result.ms} ms)`}`,
  )
  return result.ok ? 0 : 1
}

export async function commandDeploy({
  formatHuman,
  loadConfig,
  buildCommand,
  unsafeAllowed,
  deployCommand,
  formatHosts,
  hostsCommand,
  initCommand,
  args,
  print,
  say,
}) {
  const loaded = await loadConfig(args.root)
  const sub = args.positional[0]
  if (sub === 'hosts') {
    const result = hostsCommand(args.root, loaded.config)
    if (args.json) print(result)
    else say(formatHosts(result))
    return 0
  }
  const unsafe = unsafeAllowed(args.flags['unsafe-allow'], loaded.config)
  if (sub === 'init') {
    const result = initCommand(args.root, loaded.config, {
      target: args.positional[1] ?? args.flags.target,
      dryRun: !!args.flags['dry-run'],
      force: !!args.flags.force,
      unsafe,
    })
    if (args.json) print(result)
    say(formatHuman(result.findings))
    say(
      [
        `kerf deploy init ${result.target}${result.dryRun ? ' (dry run: nothing written)' : ''}:`,
        ...result.actions.map((a) => `  ${a}`),
        '',
        'then, once:',
        ...result.next.map((n) => `  ${n}`),
      ].join('\n'),
    )
    return 0
  }
  if (sub !== undefined)
    throw Object.assign(
      new Error(
        `kerf deploy ${String(sub)}: use \`kerf deploy\`, \`kerf deploy hosts\` or \`kerf deploy init [target]\``,
      ),
      { code: 'E_USAGE' },
    )
  const result = await deployCommand(args.root, loaded.config, {
    target: args.flags.target,
    prod: !!args.flags.prod,
    yes: !!args.flags.yes,
    unsafe,
    build: (root, o) => buildCommand(root, { ...o, unsafeAllow: args.flags['unsafe-allow'] }),
  })
  if (args.json) print(result)
  say(formatHuman(result.diagnostics))
  if (result.dryRun)
    say(
      [
        `kerf deploy: a dry run for ${result.target}${result.prod ? ' (production)' : ' (a preview)'}. With --yes it runs:`,
        ...result.steps.map(
          (s) =>
            `  ${s.what}${s.reads.length ? `\n      reads ${s.reads.join(', ')} from the environment` : ''}`,
        ),
      ].join('\n'),
    )
  else
    say(
      `kerf deploy: ${result.target}${result.prod ? ' (production)' : ''} → ${result.url ?? 'deployed; the host printed no URL'}`,
    )
  return 0
}

export async function commandStart({ startCommand, args }) {
  return await startCommand(args.root, { runtime: args.flags.runtime })
}

export async function commandDb({ dbCommand, args, print, say }) {
  const result = await dbCommand(args.root, args.positional[0], args.positional[1])
  if (args.json) print(result)
  say(result.output)
  return 0
}

export async function commandRoutes({ formatHuman, metaTable, routesCommand, args, print, say }) {
  const result = await routesCommand(args.root, {
    meta: !!args.flags.meta,
    preset: args.flags.preset,
  })
  if (args.json) print(result)
  else
    say(
      args.flags.meta
        ? metaTable(result)
        : result.routes.map((r) => `${r.path.padEnd(24)} ${r.file}`).join('\n'),
    )
  say(formatHuman(result.diagnostics))
  return result.ok ? 0 : 1
}

export function commandSurfaces({ listSurfaces, args, print, say }) {
  const surfaces = listSurfaces(args.root)
  if (args.json) print({ surfaces })
  else
    say(
      surfaces.length
        ? surfaces
            .map(
              (x) =>
                `${String(x.name).padEnd(20)} ${String(x.kind).padEnd(10)} ${x.file}:${x.line}  props: ${x.props.join(', ') || '(none)'}`,
            )
            .join('\n')
        : 'No surfaces yet: `kerf docs surface`.',
    )
  return 0
}

export async function commandTasks({ formatHuman, tasks, args, print, say }) {
  const result = await tasks(args.root)
  if (args.json) print(result)
  else
    say(
      result.tasks
        .map((t) => `${t.available ? ' ' : '·'} ${t.name.padEnd(10)} ${t.description ?? ''}`)
        .join('\n'),
    )
  say(formatHuman(result.diagnostics))
  return result.ok ? 0 : 1
}

export async function commandRun({ runTask, args }) {
  if (!args.positional[0]) throw Object.assign(new Error('kerf run <task>'), { code: 'E_USAGE' })
  return await runTask(args.root, args.positional[0])
}

export async function commandDocs({ docs, args, print, io }) {
  const page = await docs(args.root, args.positional[0])
  if (args.json) print(page)
  else io.stdout.write(`${page.text}\n`)
  return 0
}

export async function commandAgentsMd({ writeAgentsMd, args, print, say, io }) {
  const out = await writeAgentsMd(args.root, { check: args.check || args.stdout })
  if (args.stdout) io.stdout.write(out.text)
  if (args.json)
    print({
      path: out.path,
      bytes: out.bytes,
      limit: 9216,
      overLimit: out.overLimit,
      current: out.current,
      written: out.written,
    })
  say(
    `AGENTS.md: ${out.bytes} bytes${out.overLimit ? ' (over the 9 KB limit)' : ''}, ${out.written ? 'written' : out.current ? 'current' : 'stale'}`,
  )
  return (args.check && !out.current) || out.overLimit ? 1 : 0
}
