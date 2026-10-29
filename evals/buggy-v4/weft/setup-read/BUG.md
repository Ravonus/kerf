Row reads its quote once in the component body (const quote = live.get(id)), so price, change and sparkline never update.
