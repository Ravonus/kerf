// This suite is prepared for task-specific calibration after the active edit run.
import { productTests, stockTests } from '../medium-shop/products-checks.mjs'
import { cartTests } from '../medium-shop/cart-checks.mjs'
import { checkoutTests } from '../medium-shop/checkout-checks.mjs'
import { bugTests } from './checks.mjs'

export const tests = [...productTests, ...stockTests, ...cartTests, ...checkoutTests, ...bugTests]
