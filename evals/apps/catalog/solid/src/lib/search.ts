export const pageSize = 24;

export type ProductSearch = { page: number; min?: number; max?: number; stock: boolean };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Whole dollars from the URL. Past this nothing is for sale, and cents still fit the column. */
function dollars(v: unknown) {
  const raw = first(v);
  if (raw === undefined || raw === "") return undefined;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1_000_000) : undefined;
}

/** Whatever the URL says, as a search the server can run. The same parse on both sides gives preload and page the same query key, and the server's parse of an already parsed search changes nothing. */
export function parseSearch(raw: Partial<Record<keyof ProductSearch, unknown>>): ProductSearch {
  const page = Number(first(raw.page));
  const stock = first(raw.stock);
  return {
    page: Number.isSafeInteger(page) && page > 0 && page < 1e6 ? page : 1,
    min: dollars(raw.min),
    max: dollars(raw.max),
    stock: stock !== undefined && stock !== false,
  };
}

/** The URL a search lives at, with what's at its default left out. */
export function searchHref(slug: string, s: ProductSearch, page: number) {
  const p = new URLSearchParams();
  if (s.min !== undefined) p.set("min", String(s.min));
  if (s.max !== undefined) p.set("max", String(s.max));
  if (s.stock) p.set("stock", "1");
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return qs ? `/c/${slug}?${qs}` : `/c/${slug}`;
}
