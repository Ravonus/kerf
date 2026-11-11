import type { Field, Node } from "./sdf.js";
/** A ball of space: a centre and a radius. */
export type Ball = readonly [number, number, number, number];
/**
 * The distance function of `node` for points within `ball`, correct wherever the surface is within `slack`, or null
 * if nothing of it comes within `slack` of the ball.
 */
export declare function compile(node: Node, ball: Ball, slack: number): Field | null;
