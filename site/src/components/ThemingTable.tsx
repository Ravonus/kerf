export type ThemingRow = {
  part: string
  property: string
  state: string
  default: string
  config: string
  token: string
  status: string
}
/** Show schema candidates and recorded fallbacks for a component's scope. */
export function ThemingTable(props: { rows: ThemingRow[] }) {
  const rows = props.rows
  return (
    <section id="theming" aria-labelledby="theming-title">
      <h3 id="theming-title" data-flow="heading">
        Theming
      </h3>
      <p data-part="note" data-flow="item">
        These are schema candidates, not a list of supported <code>warp()</code> options. Defaults
        show recorded CSS fallbacks where available; coverage is still being classified.
      </p>
      {rows.length ? (
        <div
          data-scope="props"
          tabindex="0"
          role="region"
          aria-label="Theming candidates"
          data-site="props"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Part</th>
                <th scope="col">Property</th>
                <th scope="col">State</th>
                <th scope="col">Default</th>
                <th scope="col">Config key</th>
                <th scope="col">Custom property</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.part}:${row.state}:${row.property}`}>
                  <th scope="row">
                    <code>{row.part}</code>
                  </th>
                  <td data-label="Property">
                    <code>{row.property}</code>
                  </td>
                  <td data-label="State">{row.state}</td>
                  <td data-label="Default">
                    <code style="overflow-wrap:anywhere">{row.default}</code>
                  </td>
                  <td data-label="Config key">
                    <code style="overflow-wrap:anywhere">{row.config}</code>
                  </td>
                  <td data-label="Token">
                    <code style="overflow-wrap:anywhere">{row.token}</code>
                  </td>
                  <td data-label="Status">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p data-part="note" data-flow="item">
          No theming candidates are classified for this component yet.
        </p>
      )}
    </section>
  )
}
