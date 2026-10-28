# Ticket 3: search, category and sort

On the Products tab, add:

- a text input labelled **Search** that shows only products whose name contains the text (case-insensitive),
- a `<select>` labelled **Category** with options `All`, `fruit`, `bakery`, `dairy` (values `all`, `fruit`, `bakery`,
  `dairy`), default `All`,
- a `<select>` labelled **Sort** with options `Name` (value `name`, the default), `Price: low to high` (value
  `price-asc`) and `Price: high to low` (value `price-desc`),
- a count of the products currently shown, as `N products` (or `1 product`) in an element with
  `data-testid="product-count"`.

Shoppers switch between the Products and Cart tabs a lot. Coming back to Products must keep their search, category
and sort.
