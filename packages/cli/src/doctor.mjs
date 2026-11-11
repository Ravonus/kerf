// `kerf doctor`: what this install compiles with, and whether Rust is around. Everything here is information: Rust is
// optional, the WASM compiler is a full compiler, and the addon only adds speed. Nothing it reports fails the command.

import { spawnSync } from 'node:child_process'
import { loadCompiler, resolveKerf } from './kerf.mjs'

/** One line for `kerf check --verbose` and `kerf doctor`. */
export function compilerLine(backend) {
  if (!backend) return 'compiler: this kerf does not say which build it uses'
  if (backend.kind === 'native')
    return `compiler: native addon${backend.package ? ` (${backend.package})` : ` (${backend.file})`}`
  const offer = backend.wanted?.length
    ? `. Optional, and faster: ${backend.wanted.join(' or ')}, which a normal install adds by itself`
    : '. No prebuilt addon for this platform, and none is needed'
  return `compiler: WASM, same output as the addon${offer}`
}

export function doctor(root) {
  const kerf = resolveKerf(root)
  const { backend } = loadCompiler(kerf)
  const cargo = spawnSync('cargo', ['--version'], { encoding: 'utf8' })
  const version = cargo.status === 0 ? cargo.stdout.trim() : null
  const runtime = globalThis.Deno
    ? `Deno ${Deno.version.deno}`
    : globalThis.Bun
      ? `Bun ${Bun.version}`
      : `Node ${process.version}`
  return {
    ok: true,
    kerf: kerf.version,
    runtime,
    compiler: backend ?? null,
    rust: { cargo: version, required: false },
  }
}

export const formatDoctor = (r) =>
  [
    `kerf ${r.kerf} on ${r.runtime}`,
    compilerLine(r.compiler),
    `rust: ${r.rust.cargo ?? 'no cargo on PATH'}. Not needed for kerf; only \`kerf add rust\` sidecars and native() use it`,
  ].join('\n')
