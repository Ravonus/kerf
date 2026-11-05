import { resolve } from 'node:path'

/** Same spelling as `urlVariable` in rust.ts, which can't share a module with this one: it ships in the server bundle. */
export const urlVariable = (service) =>
  `WEFT_RUST_${service.toUpperCase().replaceAll('-', '_')}_URL`

const external = (rust, service) => rust?.services?.[service]?.external === true
/** The crate folder of a service. */
export const crateDir = (root, rust, service) =>
  resolve(root, rust?.services?.[service]?.crate ?? `crates/${service}`)

/** The services in a contract that have a crate here. */
export const buildable = (contract, rust) =>
  Object.keys(contract.services ?? {}).filter((s) => !external(rust, s))
export const isNative = (contract, service) => contract.services?.[service]?.kind === 'native'

export const stem = (service) => service.replaceAll('-', '_')
