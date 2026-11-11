import { state } from '@kerf/core'
import {
  PlaceLookupInput,
  Stack,
  Text,
} from '@kerf/veneer'
import type { Place } from '@kerf/veneer'

/* ---- PlaceLookupInput ---- */

export const PLACES: Place[] = [
  {
    id: 'sto',
    displayName: 'Stockholm, Sweden',
    category: 'City',
    lat: 59.3293,
    lng: 18.0686,
    timezone: 'Europe/Stockholm',
  },
  {
    id: 'ber',
    displayName: 'Berlin, Germany',
    category: 'City',
    lat: 52.52,
    lng: 13.405,
    timezone: 'Europe/Berlin',
  },
  {
    id: 'lis',
    displayName: 'Lisbon, Portugal',
    category: 'City',
    lat: 38.7223,
    lng: -9.1393,
    timezone: 'Europe/Lisbon',
  },
  {
    id: 'lim',
    displayName: 'Lima, Peru',
    category: 'City',
    lat: -12.0464,
    lng: -77.0428,
    timezone: 'America/Lima',
  },
  {
    id: 'tok',
    displayName: 'Tokyo, Japan',
    category: 'City',
    lat: 35.6762,
    lng: 139.6503,
    timezone: 'Asia/Tokyo',
  },
  {
    id: 'arn',
    displayName: 'Stockholm Arlanda Airport',
    category: 'Airport',
    lat: 59.6498,
    lng: 17.9238,
    timezone: 'Europe/Stockholm',
  },
  {
    id: 'lhr',
    displayName: 'London Heathrow Airport',
    category: 'Airport',
    lat: 51.47,
    lng: -0.4543,
    timezone: 'Europe/London',
  },
]

const PLACE_KINDS = [
  { id: 'city', label: 'Cities', default: true },
  { id: 'air', label: 'Airports' },
]

export const findPlace = async (
  q: string,
  o: { bias: Record<string, boolean> },
) => {
  await new Promise((done) => {
    setTimeout(done, 200)
  })
  const kinds = [
    o.bias.city && 'City',
    o.bias.air && 'Airport',
  ]
  return PLACES.filter(
    (p) =>
      kinds.includes(p.category) &&
      p.displayName
        .toLowerCase()
        .includes(q.toLowerCase()),
  )
}

export const PlaceLookupInputBasic = () => (
  <PlaceLookupInput
    label="Office location"
    hint="Try Stockholm or Lima."
    search={findPlace}
    biases={PLACE_KINDS}
  />
)

export function PlaceLookupInputPicked() {
  const place = state<Place | null>(PLACES[0] ?? null)
  return (
    <Stack gap="related">
      <PlaceLookupInput
        label="Nearest office"
        search={findPlace}
        value={place}
      />
      <Text subtle>
        {place.value
          ? 'New deploys run close to ' +
            `${place.value.displayName}.`
          : 'Pick a place from the list.'}
      </Text>
    </Stack>
  )
}
