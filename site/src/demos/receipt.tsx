import show from '../generated/showcase.json'

export default function Receipt() {
  const { kerf, kit, total } = show.receipt
  return (
    <figure data-part="receipt">
      <p style={`--share:${(kerf / total) * 100}%`}>
        <span>Kerf and the shop</span>
        <b>{kerf} KB</b>
      </p>
      <p style={`--share:${(kit / total) * 100}%`}>
        <span>Veneer components it uses</span>
        <b>{kit} KB</b>
      </p>
      <p data-part="total">
        <span>JavaScript sent</span>
        <b>{total} KB</b>
      </p>
    </figure>
  )
}
