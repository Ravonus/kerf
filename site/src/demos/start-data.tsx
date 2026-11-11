import { Card } from '@kerf/veneer'

const barista = {
  name: 'Noor',
  since: 2019,
  favourite: 'Flat white',
  size: 64,
}

export default function Profile() {
  return (
    <Card title={`Meet ${barista.name}`}>
      <div
        role="img"
        aria-label={`${barista.name}'s initial`}
        style={{
          width: barista.size,
          height: barista.size,
          borderRadius: 'var(--veneer-radius-round)',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--veneer-color-accent-solid)',
          color: 'var(--veneer-color-surface)',
          fontSize: barista.size / 2,
        }}
      >
        {barista.name.charAt(0)}
      </div>
      <p>Pulling shots since {barista.since}.</p>
      <p>
        Favourite drink: {barista.favourite.toLowerCase()}
      </p>
    </Card>
  )
}
