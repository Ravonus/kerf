import { useState as make } from 'react'
function useCart() {
  return make(0)
}
export function App() {
  useCart()
  return <p />
}
