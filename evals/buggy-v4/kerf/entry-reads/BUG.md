Row JSX reads live.value[stock.id] / favorites.value[stock.id] instead of .get(id): every row's holes depend on the whole record and re-run on every quote (W017).
