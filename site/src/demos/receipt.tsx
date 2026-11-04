import show from '../generated/showcase.json'

export default function Receipt() {
  const { weft, kit, total } = show.receipt
  return (
    <figure data-part="receipt">
      <p style={`--share:${(weft / total) * 100}%`}>
        <span>weft and the shop</span>
        <b>{weft} KB</b>
      </p>
      <p style={`--share:${(kit / total) * 100}%`}>
        <span>warp components it uses</span>
        <b>{kit} KB</b>
      </p>
      <p data-part="total">
        <span>JavaScript sent</span>
        <b>{total} KB</b>
      </p>
    </figure>
  )
}
