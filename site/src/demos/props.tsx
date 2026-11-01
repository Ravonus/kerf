import { state } from 'weft'

function Price(props: { amount: number }) {
  return <output>{props.amount}</output>
}

export default function Cart() {
  const amount = state(10)
  return (
    <>
      <button onClick={() => amount.value++}>+1</button>
      <Price amount={amount.value} />
    </>
  )
}
