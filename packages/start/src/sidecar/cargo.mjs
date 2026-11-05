import { spawn } from 'node:child_process'
import { join, relative, resolve } from 'node:path'

const WASM = 'wasm32-unknown-unknown'

// ---- cargo --------------------------------------------------------------------------------------------------------

function run(cmd, args, { cwd, env, onLine }) {
  return new Promise((ok) => {
    let child
    try {
      child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      ok({ code: 127, stdout: '', stderr: e.message, missing: true })
      return
    }
    let stdout = '',
      stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
      onLine?.(`${d}`)
    })
    child.on('error', (e) =>
      ok({ code: 127, stdout, stderr: e.message, missing: e.code === 'ENOENT' }),
    )
    child.on('close', (code) => ok({ code, stdout, stderr }))
  })
}

const pascal = (name) => name[0].toUpperCase() + name.slice(1)
const snake = (name) => name.replace(/[A-Z]/g, (c, i) => `${i ? '_' : ''}${c.toLowerCase()}`)

/**
 * cargo's JSON messages as diagnostics. An error that names a contract function's types or method is R103, with the
 * function's id, so it points at the TS edit that caused it (research 06 §7); any other is R109.
 */
export function readCargo(stdout, { contract, service, root, dir }) {
  const fns = (contract?.functions ?? []).filter((f) => f.impl?.service === service)
  const names = fns.map((f) => ({
    id: f.id,
    re: new RegExp(`\\b(${pascal(f.name)}\\w*|${snake(f.name)})\\b`),
  }))
  const diagnostics = []
  let exe,
    lib,
    ok = false
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue
    let m
    try {
      m = JSON.parse(line)
    } catch {
      continue
    }
    if (m.reason === 'compiler-artifact' && m.executable && m.target?.kind?.includes('bin'))
      exe = m.executable
    if (m.reason === 'compiler-artifact' && m.target?.kind?.includes('cdylib'))
      lib = m.filenames?.find((f) => /\.(dylib|so|dll|wasm)$/.test(f))
    if (m.reason === 'build-finished') ok = m.success
    if (m.reason !== 'compiler-message' || m.message?.level !== 'error' || !m.message.code) continue
    const text = m.message.rendered ?? m.message.message
    const hit = names.find((n) => n.re.test(text))
    const at = m.message.spans?.find((s) => s.is_primary) ?? m.message.spans?.[0]
    const file = at && relative(root, resolve(dir, at.file_name)).replaceAll('\\', '/')
    diagnostics.push({
      code: hit ? 'R103' : 'R109',
      severity: 'error',
      ...(hit && { function: hit.id }),
      file: file ?? '.weft/contract.json',
      span: at ? [at.line_start, at.column_start, at.line_end, at.column_end] : [1, 1, 1, 1],
      why: hit
        ? `\`${hit.id}\`: the Rust no longer matches the contract: ${m.message.message}`
        : `\`${service}\` doesn't compile: ${m.message.message}`,
      rendered: text,
    })
  }
  return { ok, exe, lib, diagnostics }
}

/** `verb`: `build` or `check`. Failure names what to fix: a build script's panic is already R103 with the fix. */
export async function cargo(verb, { root, dir, service, contract, release, target, onLine }) {
  const args = [
    verb,
    '--message-format=json',
    ...(release ? ['--release'] : []),
    ...(target ? ['--target', target] : []),
  ]
  const env = {
    WEFT_CONTRACT: join(root, '.weft', 'contract.json'),
    ...(target === WASM && {
      CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS: '-C target-feature=+simd128',
    }),
  }
  const r = await run('cargo', args, { cwd: dir, env, onLine })
  if (r.missing)
    return {
      ok: false,
      diagnostics: [
        {
          code: 'R109',
          severity: 'error',
          file: 'package.json',
          span: [1, 1, 1, 1],
          why: `\`${service}\` is Rust you opted into, so it needs \`cargo\`, and it isn't on PATH. Install it from rustup.rs, or set \`external: true\` for a sidecar built elsewhere. The rest of weft doesn't need Rust.`,
        },
      ],
    }
  const read = readCargo(r.stdout, { contract, service, root, dir })
  if (r.code === 0) return read
  if (!read.diagnostics.length) {
    const panic = /R103: ([^\n]+)/.exec(r.stderr)?.[1]
    read.diagnostics.push({
      code: panic ? 'R103' : 'R109',
      severity: 'error',
      file: relative(root, dir).replaceAll('\\', '/') + '/Cargo.toml',
      span: [1, 1, 1, 1],
      why:
        panic ??
        `cargo ${verb} failed in \`${service}\`:\n${r.stderr.trim().split('\n').slice(-12).join('\n')}`,
    })
  }
  return { ...read, ok: false }
}

/** R104 for a `.wasm` that won't build: a warning unless the build needs it. `error`: the preset has no other way to run. */
export async function checkWasm({ root, dir, service, contract, preset, rust, build }) {
  if (rust?.services?.[service]?.wasm === false) return { diagnostics: [] }
  const r = await cargo(build ? 'build' : 'check', {
    root,
    dir,
    service,
    contract,
    target: WASM,
    release: build,
  })
  if (r.ok) return { lib: r.lib, diagnostics: [] }
  const missing = r.diagnostics.find((d) =>
    /can't find crate for `(std|core)`|target may not be installed/.test(
      `${d.why}${d.rendered ?? ''}`,
    ),
  )
  const why = missing
    ? `\`rustup target add ${WASM}\`: this toolchain can't build \`${service}\`'s WASM fallback`
    : `\`${service}\` has no WASM fallback: ${r.diagnostics[0]?.why ?? 'the build failed'}`
  const needed = preset && !/^(node|bun|deno[-_]server)/.test(preset)
  return {
    diagnostics: [
      {
        code: 'R104',
        severity: needed ? 'error' : 'warning',
        file: relative(root, dir).replaceAll('\\', '/') + '/Cargo.toml',
        span: [1, 1, 1, 1],
        why: `${why}. An addon loads on this machine, and nothing else can run it. Fix it, or set \`rust.services.${service}.wasm: false\` to say so`,
      },
    ],
  }
}
