import { action, query } from "@solidjs/router";

import { loadViewer, signIn, signOut } from "~/server/account";
import {
  loadBiggestCustomers,
  loadCustomer,
  loadOrder,
  loadOrders,
  loadOverview,
  loadReach,
  loadRecentOrders,
  loadReport,
  loadTopCities,
  markOrdersShipped,
  setOrderStatus,
} from "~/server/orders";

export const getViewer = query(loadViewer, "viewer");
export const getOverview = query(loadOverview, "overview");
export const getOrders = query(loadOrders, "orders");
export const getOrder = query(loadOrder, "order-detail");
export const getReach = query(loadReach, "reach");
export const getTopCities = query(loadTopCities, "top-cities");
export const getBiggestCustomers = query(loadBiggestCustomers, "biggest-customers");
export const getRecentOrders = query(loadRecentOrders, "recent-orders");
export const getCustomer = query(loadCustomer, "customer");
export const getReport = query(loadReport, "report");

export const signInAction = action(signIn, "signIn");
export const signOutAction = action(signOut, "signOut");

/** Writes leave one at a time: each reply carries the page as that write left it, and an older one mustn't land last. */
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

export const markShipped = action(inOrder(markOrdersShipped), "markShipped");
export const setStatus = action(inOrder(setOrderStatus), "setStatus");
