// Every medium-shop behavior remains required after the extension.
import { productTests, stockTests } from '../medium-shop/products-checks.mjs'
import { cartTests } from '../medium-shop/cart-checks.mjs'
import { checkoutTests } from '../medium-shop/checkout-checks.mjs'
import { editTests } from './checks.mjs'

export const tests = [...productTests, ...stockTests, ...cartTests, ...checkoutTests, ...editTests]
