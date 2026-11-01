Build a shop at `/`, with data held in memory on the client.

Products, in this order of data: Apple (fruit, $0.50, stock 20), Banana (fruit, $0.25, stock 3), Bagel (bakery, $1.20, stock 6), Brioche (bakery, $3.50, stock 1), Milk (dairy, $1.10, stock 10), Yogurt (dairy, $0.90, stock 0).

- Two tabs, buttons `Products` and `Cart (N)`, N being the number of items in the cart. Switching tabs keeps everything: the cart, search, category, sort.
- On Products, each product shows in a list labelled `Products` with its name, price as `$0.50`, and a button `Add <name>`.
  - When 3 or fewer more can be added, the row shows `Only N left`. When none can, it shows `Out of stock` and the button is disabled.
- A text input labelled `Search` filters to names containing the text, case-insensitively.
- A select labelled `Category` with options `All`, `fruit`, `bakery`, `dairy`. A select labelled `Sort` with options `Name` (default), `Price: low to high`, `Price: high to low`.
- Text `N products`, or `1 product`, counts what's shown.
- On Cart, lines show in a list labelled `Cart`, each with name, quantity, line total, and buttons `Increase <name>` and `Decrease <name>`. Decreasing to zero removes the line. Increase is disabled at the product's stock. Text `Total: $X.XX` shows the total. With no lines there is no list and the text reads `Your cart is empty`.
- A checkout form on Cart: `Name` (required), `Email` (required, must look like an email), `Card number` (required, 16 digits; spaces are ignored), and a `Place order` button. Submitting with an invalid field shows its error in an element linked by `aria-describedby`, sets `aria-invalid="true"`, moves focus to the first invalid field, and keeps what was typed. Submitting a valid form empties the cart and shows `Thanks, <name>!`.
