// The shop checks are grouped by behavior but all run through the hidden grader.
import { productTests, stockTests } from './products-checks.mjs'
import { cartTests } from './cart-checks.mjs'
import { checkoutTests } from './checkout-checks.mjs'

export const tests = [...productTests, ...stockTests, ...cartTests, ...checkoutTests]
