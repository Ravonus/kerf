export const statuses = ["paid", "pending", "shipped", "refunded"] as const;
export type Status = (typeof statuses)[number];

export const sorts = ["id", "customer", "status", "total", "date"] as const;
export type Sort = (typeof sorts)[number];
export type Dir = "asc" | "desc";

export const pageSize = 50;

export type OrderSearch = { page: number; sort: Sort; dir: Dir; status?: Status; q?: string };

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const oneOf = <T>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : undefined);

/** Whatever the URL says, as a search the server can run. The same parse on both sides gives preload and page the same query key. */
export function parseSearch(raw: Partial<Record<keyof OrderSearch, unknown>>): OrderSearch {
  const page = Number(first(raw.page));
  const q = String(first(raw.q) ?? "").trim().slice(0, 100);
  return {
    page: Number.isSafeInteger(page) && page > 0 && page < 1e6 ? page : 1,
    sort: oneOf(sorts, first(raw.sort)) ?? "date",
    dir: oneOf(["asc", "desc"] as const, first(raw.dir)) ?? "desc",
    status: oneOf(statuses, first(raw.status)),
    q: q || undefined,
  };
}

/** The URL a search lives at, with what's at its default left out. */
export function searchHref(s: OrderSearch, page: number) {
  const p = new URLSearchParams();
  if (page > 1) p.set("page", String(page));
  if (s.sort !== "date" || s.dir !== "desc") {
    p.set("sort", s.sort);
    p.set("dir", s.dir);
  }
  if (s.status) p.set("status", s.status);
  if (s.q) p.set("q", s.q);
  const qs = p.toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}
