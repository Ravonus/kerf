Row snapshots its quote in the body with untrack(() => live.get(id)) (silencing W001), so price, change and sparkline never update.
