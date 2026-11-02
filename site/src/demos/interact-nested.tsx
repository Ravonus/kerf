import { state } from '@weft-js/core'
import { Card, Input } from '@weft-js/warp'

export default function Artwork() {
  const piece = state({
    title: 'Blue Nana',
    artist: { name: 'Niki de Saint Phalle', city: 'Hamburg' },
  })
  // A new artist object inside a new piece object: each level you change is copied.
  const setCity = (city: string) => (piece.value = { ...piece.value, artist: { ...piece.value.artist, city } })
  return (
    <Card title="A nested object">
      <Input
        label="Title"
        value={piece.value.title}
        onInput={e => (piece.value = { ...piece.value, title: e.currentTarget.value })}
      />
      <Input label="City" value={piece.value.artist.city} onInput={e => setCity(e.currentTarget.value)} />
      <p><i>{piece.value.title}</i> by {piece.value.artist.name}, lives in {piece.value.artist.city}</p>
    </Card>
  )
}
