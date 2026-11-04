import { Title } from '@solidjs/meta'

import { NotFound } from '~/components/states'

export default function Missing() {
  return (
    <>
      <Title>Not on the shelves · Mendwell</Title>
      <NotFound />
    </>
  )
}
