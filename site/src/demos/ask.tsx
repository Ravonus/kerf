import built from '../generated/arena-built.json'

export default function Ask() {
  if (!built.graph)
    return (
      <p
        data-part="missing"
        role="status"
      >
        This demo isn't in this build: its frame comes
        from <code>../benchmarks/arena/build.mjs</code>,
        which hasn't been run.
      </p>
    )
  return (
    <iframe
      data-part="ask"
      title="A todo app beside its reactive graph"
      loading="lazy"
      src="/arena/graph/"
    ></iframe>
  )
}
