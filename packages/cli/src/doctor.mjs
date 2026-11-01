// `weft doctor`: what this install compiles with, and whether Rust is around. Everything here is information: Rust is
// optional, the WASM compiler is a full compiler, and the addon only adds speed. Nothing it reports fails the command.

import { spawnSync } from 'node:child_process'
import { loadCompiler, resolveWeft } from './weft.mjs'

/** One line for `weft check --verbose` and `weft doctor`. */
export function compilerLine(backend) {
  if (!backend) return 'compiler: this weft does not say which build it uses'
  if (backend.kind === 'native') return `compiler: native addon${backend.package ? ` (${backend.package})` : ` (${backend.file})`}`
  const offer = backend.wanted?.length
    ? `. Optional, and faster: ${backend.wanted.join(' or ')}, which a normal install adds by itself`
    : '. No prebuilt addon for this platform, and none is needed'
  return `compiler: WASM, same output as the addon${offer}`
}

export function doctor(root) {
  const weft = resolveWeft(root)
  const { backend } = loadCompiler(weft)
  const cargo = spawnSync('cargo', ['--version'], { encoding: 'utf8' })
  const version = cargo.status === 0 ? cargo.stdout.trim() : null
  const runtime = globalThis.Deno ? `Deno ${Deno.version.deno}` : globalThis.Bun ? `Bun ${Bun.version}` : `Node ${process.version}`
  return { ok: true, weft: weft.version, runtime, compiler: backend ?? null, rust: { cargo: version, required: false } }
}

export const formatDoctor = r => [
  `weft ${r.weft} on ${r.runtime}`,
  compilerLine(r.compiler),
  `rust: ${r.rust.cargo ?? 'no cargo on PATH'}. Not needed for weft; only \`weft add rust\` sidecars and native() use it`,
].join('\n')
