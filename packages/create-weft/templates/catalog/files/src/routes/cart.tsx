import type { Meta } from '@weft/start'
import { Center, Heading, Stack, Toaster } from '@weft/warp'
import { Boundary } from 'weft'
import { CartLines, CartLoading } from '#/components/CartLines'
import { Failed } from '#/components/Failed'

export const meta: Meta = { title: 'Your cart' }

export default function Cart() {
  return (
    <Center max="content" gutter>
      <Stack gap="group" class="page">
        <Heading level={1} role="title">Your cart</Heading>
        <Boundary pending={<CartLoading />} error={(_, retry) => <Failed what="Your cart" retry={retry} />}>
          <CartLines />
        </Boundary>
      </Stack>
      <Toaster />
    </Center>
  )
}
