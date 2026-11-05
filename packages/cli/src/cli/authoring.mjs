export async function commandMap({ formatMap, writeMap, args, print, say }) {
  const map = await writeMap(args.root)
  if (args.json) print(map)
  else if (args.stdout) process.stdout.write(formatMap(map))
  else say(`.weft/map.md: ${map.rows.length} rows`)
  return 0
}

export async function commandIcons({
  createRequire,
  join,
  resolve,
  pathToFileURL,
  args,
  print,
  say,
}) {
  if (args.positional[0] !== 'publish' || !args.positional[1]) {
    say('usage: weft icons publish <dir>')
    return 1
  }
  const { publish } = await import(
    pathToFileURL(
      createRequire(join(args.root, 'package.json')).resolve('@weft-js/warp-icons/compile'),
    ).href
  )
  const out = await publish(resolve(args.root, args.positional[1]))
  if (args.json) print(out)
  else
    say(
      `${out.files} files for ${out.icons} icons in ${out.dir}. Nothing was uploaded: host that folder, then set icons({ source }).`,
    )
  return 0
}

export async function commandAdd({ addCommand, args, print, say }) {
  const result = await addCommand(args.root, args.positional[0], {
    dryRun: args.flags['dry-run'],
    install: !args.flags['no-install'],
    engine: args.positional[1],
    layer: args.flags.layer,
    remote: args.flags.remote,
  })
  if (args.json) print(result)
  else
    say(
      result.already
        ? `${result.package} is already in ${result.config}`
        : result.actions.map((a) => `${args.flags['dry-run'] ? 'would ' : ''}${a}`).join('\n'),
    )
  return 0
}

export async function commandPlugins({
  formatHuman,
  explain,
  list,
  sync,
  approveCommand,
  auditCommand,
  formatTrust,
  loadConfig,
  args,
  print,
  say,
}) {
  const sub = args.positional[0] ?? 'list'
  if (sub === 'list') {
    const result = await list(args.root)
    if (args.json) print(result)
    else
      say(
        result.plugins
          .map(
            (p) =>
              `${p.name}@${p.version ?? '?'}  ${p.provides.map((s) => `${s.slot}${s.key ? `[${s.key}]` : ''}${s.bound ? '' : ' (not bound)'}`).join(', ') || 'no slots'}${p.tokens ? `  tokens --${p.tokens}-*` : ''}`,
          )
          .join('\n') || 'no plugins',
      )
    say(formatHuman(result.diagnostics))
    return result.ok ? 0 : 1
  }
  if (sub === 'explain') {
    const result = await explain(args.root, args.positional[1])
    if (args.json) print(result)
    else say(JSON.stringify(result.binding, null, 2))
    return 0
  }
  if (sub === 'sync') {
    const loaded = await loadConfig(args.root)
    const errors = loaded.diagnostics.filter((d) => d.severity === 'error')
    const written = loaded.diagnostics.some((d) => d.code === 'P007') ? [] : sync(args.root, loaded)
    if (args.json) print({ ok: errors.length === 0, written, diagnostics: loaded.diagnostics })
    say(formatHuman(loaded.diagnostics))
    say(`weft plugins sync: ${written.length} files written`)
    return errors.length ? 1 : 0
  }
  if (sub === 'audit') {
    const loaded = await loadConfig(args.root)
    const result = auditCommand(args.root, loaded)
    if (args.json) print(result)
    else say(result.plugins.map(formatTrust).join('\n') || 'no plugins')
    say(formatHuman(result.diagnostics))
    return result.ok ? 0 : 1
  }
  if (sub === 'approve') {
    const result = approveCommand(args.root, await loadConfig(args.root), {
      names: args.positional.slice(1),
      all: !!args.flags.all,
    })
    if (args.json) print(result)
    else
      say(
        [
          ...(result.written ? result.approved : result.pending).map(formatTrust),
          result.written
            ? `${result.lock}: ${result.approved.length} approved`
            : result.pending.length
              ? 'nothing written: name a plugin, or pass --all'
              : 'nothing waiting',
          ...(result.written ? result.pending.map((p) => `still waiting: ${p.name}`) : []),
          ...(result.gitignore ? ['.gitignore: the lock is no longer ignored, so commit it'] : []),
        ].join('\n'),
      )
    return result.ok ? 0 : 1
  }
  throw Object.assign(new Error(`unknown plugins subcommand ${String(sub)}`), {
    code: 'E_USAGE',
  })
}

export async function commandFix({ fix, args, print, say }) {
  const result = await fix(args.root, { files: args.positional })
  if (args.json) print(result)
  else
    say(
      result.applied.length
        ? result.applied.map((a) => `${a.file}:${a.span[0]}:${a.span[1]}  ${a.code}`).join('\n')
        : 'nothing to fix',
    )
  return 0
}

export async function commandTokens({ writeTokens, args, print, say }) {
  const result = await writeTokens(args.root)
  if (args.json) print(result)
  else say(`${result.dir}: ${result.files.length} files`)
  return 0
}

export async function commandStyle({
  explainTarget,
  findGroups,
  formatExplain,
  formatFind,
  styleMatrix,
  writeMatrixFile,
  args,
  print,
  say,
}) {
  const sub = args.positional[0]
  if (sub === 'find') {
    const result = findGroups(
      (await styleMatrix(args.root)).matrix,
      args.positional.slice(1).join(' '),
    )
    if (args.json) print(result)
    else say(formatFind(result))
    return 0
  }
  if (sub === 'explain') {
    const accent = args.flags.accent
      ? Object.fromEntries(
          args.flags.accent
            .split(/[\s,]+/)
            .filter(Boolean)
            .map((w) => w.split(':')),
        )
      : undefined
    const states = args.flags.states
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const result = explainTarget(await styleMatrix(args.root), args.positional.slice(1).join(' '), {
      axes: args.flags.axes,
      states,
      accent,
      part: args.flags.part,
    })
    if (args.json) print(result)
    else say(formatExplain(result))
    return 0
  }
  if (sub === 'matrix') {
    const { matrix } = await styleMatrix(args.root)
    const written = args.stdout ? false : writeMatrixFile(args.root, matrix)
    if (args.stdout || args.json) print(matrix)
    say(
      `.weft/styles.json: ${Object.keys(matrix.groups).length} groups, ${matrix.diagnostics.length} diagnostics, ${args.stdout ? 'not written' : written ? 'written' : 'current'}`,
    )
    return 0
  }
  throw Object.assign(
    new Error(`weft style ${sub ?? ''}: use find <query>, explain <group|selector> or matrix`),
    { code: 'E_USAGE' },
  )
}

export async function commandMcp({ serve, args }) {
  await serve(args.root)
  return 0
}
