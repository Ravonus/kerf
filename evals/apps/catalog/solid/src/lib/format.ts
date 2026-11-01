// Fixed locale: the server's and the browser's have to print the same text.
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const money = (cents: number) => usd.format(cents / 100);
