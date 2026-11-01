import { action, query } from "@solidjs/router";

import { addItem, loadCart, loadCartCount, setItem } from "~/server/cart";
import { loadCategory, loadHome, loadProduct } from "~/server/catalog";

export const getHome = query(loadHome, "home");
export const getCategory = query(loadCategory, "category");
export const getProduct = query(loadProduct, "product");
export const getCartCount = query(loadCartCount, "cart-count");
export const getCart = query(loadCart, "cart");

/** Writes leave one at a time: the first creates the cart the next one's cookie names, and an older count mustn't land last. */
let tail: Promise<unknown> = Promise.resolve();

type ServerFn<A extends unknown[], R> = ((...args: A) => Promise<R>) & { url?: string; withOptions?: (o: object) => ServerFn<A, R> };

function inOrder<A extends unknown[], R>(fn: ServerFn<A, R>): ServerFn<A, R> {
  const queued = (...args: A) => {
    const sent = tail.then(() => fn(...args));
    tail = sent.catch(() => {});
    return sent;
  };
  return Object.assign(queued, { url: fn.url, withOptions: fn.withOptions && ((o: object) => inOrder(fn.withOptions!(o))) });
}

export const addToCart = action(inOrder(addItem), "addToCart");
export const setQuantity = action(inOrder(setItem), "setQuantity");
