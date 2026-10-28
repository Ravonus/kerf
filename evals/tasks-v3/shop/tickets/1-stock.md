# Ticket 1: stock limits

Products have limited stock (the `stock` field is already in the data). Shoppers must never be able to put more of a
product in their cart than is in stock, whether they add from the product list or increase it in the cart.

- On a product row, when 3 or fewer more can be added, show `Only N left` (N = how many more can be added).
- When none are left to add, the row shows `Out of stock` instead and its Add button is disabled.
- In the cart, the Increase button for a line is disabled when that line has reached the product's stock.
