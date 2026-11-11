// The platforms with a prebuilt compiler addon, each published as @kerf-js/compiler-<name> and listed in kerf's
// optionalDependencies. The installer keeps the one that matches (`os`, `cpu`, `libc`). Anywhere else runs the WASM build.
exports.platforms = [
  { name: 'darwin-arm64', target: 'aarch64-apple-darwin', os: 'darwin', cpu: 'arm64' },
  { name: 'darwin-x64', target: 'x86_64-apple-darwin', os: 'darwin', cpu: 'x64' },
  {
    name: 'linux-x64-gnu',
    target: 'x86_64-unknown-linux-gnu',
    os: 'linux',
    cpu: 'x64',
    libc: 'glibc',
  },
  {
    name: 'linux-arm64-gnu',
    target: 'aarch64-unknown-linux-gnu',
    os: 'linux',
    cpu: 'arm64',
    libc: 'glibc',
  },
  {
    name: 'linux-x64-musl',
    target: 'x86_64-unknown-linux-musl',
    os: 'linux',
    cpu: 'x64',
    libc: 'musl',
  },
  {
    name: 'linux-arm64-musl',
    target: 'aarch64-unknown-linux-musl',
    os: 'linux',
    cpu: 'arm64',
    libc: 'musl',
  },
  { name: 'win32-x64', target: 'x86_64-pc-windows-msvc', os: 'win32', cpu: 'x64' },
  { name: 'win32-arm64', target: 'aarch64-pc-windows-msvc', os: 'win32', cpu: 'arm64' },
]

/** This OS and CPU's entries. Linux has two: whichever installed and loads is the right libc. */
exports.forHost = () =>
  exports.platforms.filter((p) => p.os === process.platform && p.cpu === process.arch)
